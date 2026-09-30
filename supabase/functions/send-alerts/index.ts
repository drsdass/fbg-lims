// send-alerts: delivers queued result alerts from the outbox table.
//   Email -> provider (Resend)       no patient information in the message
//   Text  -> provider mobile (Twilio) no patient information in the message
//   Fax   -> clinic fax (email-to-fax through Resend, e.g. SmartFax) with the PDF report
// Called by the lab portal right after results are released, and by "Send now" in the Notification log.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const SB_URL = env("SUPABASE_URL");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
const cors = {
  // Requests are authorized by the signed-in user's token (checked below), not by cookies,
  // so allowing any origin is safe and avoids breakage when the portal address changes.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

  // Only signed-in lab staff who passed two-step verification may trigger sending.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return json({ error: "Not signed in" }, 401);
  let aal = "";
  try { aal = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal; } catch { /* ignore */ }
  if (aal !== "aal2") return json({ error: "Two-step verification required" }, 403);
  const { data: prof } = await admin.from("profiles").select("role,lab_roles,active").eq("user_id", u.user.id).maybeSingle();
  const canSend = prof?.role === "lab" && prof.active && (prof.lab_roles ?? []).some((r: string) => ["admin", "scientist", "reporting"].includes(r));
  if (!canSend) return json({ error: "Your role can't send result alerts" }, 403);

  const { data: rows, error } = await admin.from("outbox").select("id,data").filter("data->>status", "eq", "Queued").limit(25);
  if (error) return json({ error: error.message }, 500);

  const results: { id: string; channel: string; status: string; detail: string }[] = [];
  for (const r of rows ?? []) {
    const d = r.data;
    let status = "Sent", detail = "";
    try {
      if (d.channel === "Email") detail = await sendEmail(d);
      else if (d.channel === "Text") detail = await sendText(d);
      else if (d.channel === "Fax") detail = await sendFax(d);
      else continue;
    } catch (e) {
      status = "Failed";
      detail = String((e as Error)?.message ?? e).slice(0, 300);
    }
    const next = { ...d, status, detail, attempts: (d.attempts ?? 0) + 1, sentAt: status === "Sent" ? Date.now() : d.sentAt ?? null };
    if (status === "Sent") delete next.report; // the report stays in the order; no second copy after faxing
    await admin.from("outbox").update({ data: next }).eq("id", r.id);
    await admin.from("audit_log").insert({ actor: u.user.id, action: "send", tbl: "outbox", row_id: r.id, detail: { channel: d.channel, status } });
    results.push({ id: r.id, channel: d.channel, status, detail });
  }
  return json({ processed: results.length, sent: results.filter((x) => x.status === "Sent").length, failed: results.filter((x) => x.status === "Failed").length, results });
});

// ---------- email ----------
async function resend(payload: Record<string, unknown>) {
  const key = env("RESEND_API_KEY");
  if (!key) throw new Error("Email isn't set up: add the RESEND_API_KEY secret.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function sendEmail(d: any) {
  const from = env("ALERT_FROM");
  if (!from) throw new Error("Email isn't set up: add the ALERT_FROM secret.");
  if (!d.dest) throw new Error("No email address for this provider.");
  const portal = env("PORTAL_URL");
  const subject = d.crit ? "Critical result available - First Bio Genetics" : "New results available - First Bio Genetics";
  const text = [
    d.crit
      ? "A laboratory result that needs prompt attention is available in the First Bio Genetics provider portal. The laboratory will also call your office."
      : "New laboratory results are available in the First Bio Genetics provider portal.",
    "",
    portal ? `Sign in to view: ${portal}` : "Sign in to the provider portal to view them.",
    "",
    "This message contains no patient information.",
  ].join("\n");
  await resend({ from, to: [d.dest], subject, text });
  return `Emailed ${d.dest}`;
}

// ---------- text message ----------
function e164(raw: string) {
  const n = String(raw ?? "").replace(/\D/g, "");
  if (n.length === 10) return "+1" + n;
  if (n.length === 11 && n.startsWith("1")) return "+" + n;
  throw new Error(`"${raw}" isn't a valid US phone number.`);
}
async function sendText(d: any) {
  const sid = env("TWILIO_ACCOUNT_SID"), tok = env("TWILIO_AUTH_TOKEN"), from = env("TWILIO_FROM");
  if (!sid || !tok || !from) throw new Error("Texting isn't set up: add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.");
  const portal = env("PORTAL_URL");
  const body = d.crit
    ? `First Bio Genetics: a result needing prompt attention is in your provider portal. The lab will also call. ${portal}`
    : `First Bio Genetics: new results are available in your provider portal. ${portal}`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164(d.dest), From: from, Body: body.trim() }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `Texted ${d.dest}`;
}

// ---------- fax (email-to-fax) ----------
async function sendFax(d: any) {
  const tpl = env("FAX_EMAIL_TEMPLATE"), from = env("FAX_FROM") || env("ALERT_FROM");
  if (!tpl) throw new Error("Fax isn't set up: add the FAX_EMAIL_TEMPLATE secret, for example {number}@your-smartfax-domain.");
  if (!from) throw new Error("Fax isn't set up: add the FAX_FROM secret (the sender address registered with your fax account).");
  if (!d.report) throw new Error("This alert has no report attached. Re-release the order to create a new fax.");
  const digits = String(d.dest ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) throw new Error(`"${d.dest}" isn't a valid US fax number.`);
  const to = tpl.replaceAll("{number}", digits).replaceAll("{number1}", "1" + digits);
  const pdf = await reportPdf(d.report);
  let b64 = ""; const bytes = new Uint8Array(pdf);
  for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  b64 = btoa(b64);
  await resend({
    from, to: [to],
    subject: env("FAX_SUBJECT") || "Laboratory report",
    text: env("FAX_BODY") || " ",
    attachments: [{ filename: `report-${String(d.report.accession || "").replace(/[^A-Za-z0-9-]/g, "")}.pdf`, content: b64 }],
  });
  return `Faxed to ${d.dest}`;
}

// ---------- PDF report ----------
// Standard PDF fonts only support Western characters, so replace the few symbols the reports use.
const clean = (s: unknown) => String(s ?? "")
  .replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/⁶/g, "6").replace(/[‐‑]/g, "-")
  .replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "");

async function reportPdf(m: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, X = 40, R = W - 40, ink = rgb(0.05, 0.09, 0.15), mute = rgb(0.36, 0.41, 0.49), warn = rgb(0.99, 0.95, 0.87), crit = rgb(0.99, 0.91, 0.92);
  let page: PDFPage = doc.addPage([W, H]); let y = H - 40;
  const text = (s: string, x: number, yy: number, size = 9, f: PDFFont = reg, color = ink) => page.drawText(clean(s), { x, y: yy, size, font: f, color });
  const wrap = (s: string, width: number, size: number, f: PDFFont) => {
    const words = clean(s).split(/\s+/); const lines: string[] = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (f.widthOfTextAtSize(t, size) <= width || !cur) cur = t; else { lines.push(cur); cur = w; } }
    if (cur) lines.push(cur);
    return lines.map((l) => { while (f.widthOfTextAtSize(l, size) > width && l.length > 1) l = l.slice(0, -1); return l; });
  };
  const newPage = () => { page = doc.addPage([W, H]); y = H - 40; text(`${m.lab?.name ?? ""}  ·  ${m.patient?.name ?? ""}  ·  ${m.accession ?? ""} (continued)`, X, y, 8, reg, mute); y -= 20; };
  const need = (h: number) => { if (y - h < 50) newPage(); };

  // Header
  text(m.lab?.name ?? "", X, y, 15, bold); text("LABORATORY REPORT", R - bold.widthOfTextAtSize("LABORATORY REPORT", 12), y, 12, bold); y -= 14;
  text([m.lab?.address, m.lab?.phone].filter(Boolean).join("  ·  "), X, y, 8.5, reg, mute); y -= 11;
  text([m.lab?.clia ? `CLIA ${m.lab.clia}` : "", m.lab?.director ? `Laboratory Director: ${m.lab.director}` : ""].filter(Boolean).join("  ·  "), X, y, 8.5, reg, mute); y -= 10;
  page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 1.5, color: ink }); y -= 14;
  for (const l of wrap(`CONFIDENTIAL. This fax contains protected health information intended only for ${m.clinic ?? "the ordering provider"}. If you received it in error, call ${m.lab?.phone ?? "the laboratory"} and destroy all copies.`, R - X, 8, bold)) { text(l, X, y, 8, bold); y -= 10; }
  y -= 6;

  // Patient / order block
  const meta: [string, string][] = [
    ["Patient", m.patient?.name], ["DOB / Sex", `${m.patient?.dob ?? ""}  ${m.patient?.sex ?? ""}`], ["MRN", m.patient?.mrn],
    ["Ordering provider", m.provider], ["Provider NPI", m.npi], ["Client", `${m.clinic ?? ""}${m.acct ? ` (${m.acct})` : ""}`],
    ["Accession", m.accession], ["Collected", m.collected], ["Received", m.received],
    ["Reported", m.reported], ["Diagnosis", m.icd], ["Specimen", m.specimen],
  ];
  const cw = (R - X) / 3;
  for (let i = 0; i < meta.length; i += 3) {
    for (let j = 0; j < 3 && i + j < meta.length; j++) {
      const [k, v] = meta[i + j]; const x = X + j * cw;
      text(k, x, y, 7.5, reg, mute); text(wrap(v ?? "", cw - 8, 9, bold)[0] ?? "", x, y - 10, 9, bold);
    }
    y -= 24;
  }
  if (m.flags?.crit) { need(20); page.drawRectangle({ x: X, y: y - 4, width: R - X, height: 16, color: crit }); text(`CRITICAL VALUE REPORTED (${m.flags.crit}). The laboratory will call your office.`, X + 6, y, 9, bold); y -= 20; }

  // Result sections
  for (const s of m.sections ?? []) {
    need(40); y -= 6;
    text(s.title, X, y, 11, bold);
    if (s.performedBy) text(`Performed by ${s.performedBy}`, R - reg.widthOfTextAtSize(clean(`Performed by ${s.performedBy}`), 8), y, 8, reg, mute);
    y -= 14;
    const n = s.cols.length, widths = n === 5 && s.cols[1] === "Rx" ? [150, 30, 70, 170, 112] : [180, 85, 30, 110, 127];
    const xs = widths.reduce((a: number[], w: number, i: number) => (a.push(i ? a[i - 1] + widths[i - 1] : X), a), []);
    s.cols.forEach((c: string, i: number) => text(c, xs[i], y, 7.5, bold, mute)); y -= 4;
    page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.8, color: ink }); y -= 11;
    for (const row of s.rows) {
      const cells = row.cells.map((c: string, i: number) => wrap(c, widths[i] - 6, 8.5, i === 2 && s.cols[1] !== "Rx" ? bold : reg));
      const lines = Math.max(1, ...cells.map((c: string[]) => c.length)), h = lines * 10.5 + 2;
      need(h);
      if (row.flag) page.drawRectangle({ x: X - 2, y: y - h + 9, width: R - X + 4, height: h, color: row.crit ? crit : warn });
      cells.forEach((c: string[], i: number) => c.forEach((l, k) => text(l, xs[i], y - k * 10.5, 8.5, i === 1 || (i === 2 && s.cols[1] === "Rx") ? bold : reg)));
      y -= h;
    }
    if (s.note) { for (const l of wrap(s.note, R - X, 7.5, reg)) { need(10); text(l, X, y, 7.5, reg, mute); y -= 9.5; } }
  }

  need(40); y -= 10;
  page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.5, color: mute }); y -= 12;
  for (const l of wrap(`Released ${m.reported ?? ""}${m.releasedBy ? ` by ${m.releasedBy}` : ""}. Flags: H high, L low, A abnormal, C critical. Results should be interpreted by the ordering provider in the context of the patient's clinical presentation.`, R - X, 7.5, reg)) { text(l, X, y, 7.5, reg, mute); y -= 9.5; }

  const pages = doc.getPages();
  pages.forEach((p, i) => { const t = `Page ${i + 1} of ${pages.length}`; p.drawText(t, { x: R - reg.widthOfTextAtSize(t, 7.5), y: 24, size: 7.5, font: reg, color: mute }); });
  return await doc.save();
}
