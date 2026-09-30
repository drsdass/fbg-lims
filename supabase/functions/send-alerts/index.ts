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

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  // Which delivery channels have their vendor settings in place.
  if (body.action === "status") {
    return json({
      email: !!(env("RESEND_API_KEY") && env("ALERT_FROM")),
      text: !!(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM")),
      fax: !!(env("RESEND_API_KEY") && env("FAX_EMAIL_TEMPLATE") && (env("FAX_FROM") || env("ALERT_FROM"))),
      portalUrl: !!env("PORTAL_URL"),
    });
  }
  // Send a test message on one channel, without any patient information.
  if (body.action === "test") {
    const d: any = { channel: body.channel, dest: String(body.dest ?? "").trim(), test: true };
    try {
      let detail = "";
      if (d.channel === "Email") detail = await sendEmail(d);
      else if (d.channel === "Text") detail = await sendText(d);
      else if (d.channel === "Fax") {
        d.report = { status: "TEST", lab: { name: "First Bio Genetics", phone: "", address: "" }, accession: "TEST", patient: { name: "TEST FAX - NO PATIENT DATA", mrn: "" }, clinic: "Fax test",
          blocks: [{ type: "title", text: "Test fax" }, { type: "note", text: "This is a test fax from the First Bio Genetics portal to confirm fax delivery. It contains no patient information." }] };
        detail = await sendFax(d);
      } else throw new Error("Choose Email, Text or Fax.");
      await admin.from("audit_log").insert({ actor: u.user.id, action: "send", tbl: "outbox", row_id: "test", detail: { channel: d.channel, status: "Sent", test: true } });
      return json({ ok: true, detail });
    } catch (e) {
      return json({ ok: false, error: String((e as Error)?.message ?? e) });
    }
  }

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
  if (d.test) { await resend({ from, to: [d.dest], subject: "Test message - First Bio Genetics portal", text: "This is a test email from the First Bio Genetics portal to confirm result alerts are working. It contains no patient information." }); return `Test email sent to ${d.dest}`; }
  const subject = d.crit ? "Critical result available - First Bio Genetics" : d.corrected ? "Corrected results available - First Bio Genetics" : "New results available - First Bio Genetics";
  const text = [
    d.crit
      ? "A laboratory result that needs prompt attention is available in the First Bio Genetics provider portal. The laboratory will also call your office."
      : d.corrected ? "A corrected laboratory report is available in the First Bio Genetics provider portal. It replaces the report sent earlier."
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
  const body = d.test ? "First Bio Genetics portal: test text message. Result alerts are working."
    : d.crit
    ? `First Bio Genetics: a result needing prompt attention is in your provider portal. The lab will also call. ${portal}`
    : d.corrected ? `First Bio Genetics: a corrected report is available in your provider portal. ${portal}`
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
  // Older queued alerts carry "sections"; convert them to blocks.
  if (!m.blocks && m.sections) m.blocks = m.sections.map((s: any) => ({ type: "table", title: s.title, big: true, performedBy: s.performedBy, cols: s.cols,
    widths: s.cols.length === 5 && s.cols[1] === "Rx" ? [150, 30, 70, 170, 112] : [180, 85, 30, 110, 127],
    rows: s.rows.map((r: any) => ({ cells: r.cells, tone: r.flag ? { 1: r.crit ? "red" : "bold" } : {} })) }));
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold), mono = await doc.embedFont(StandardFonts.Courier);
  const W = 612, H = 792, X = 40, R = W - 40, ink = rgb(0.05, 0.09, 0.15), mute = rgb(0.3, 0.34, 0.42), blueLab = rgb(0.12, 0.37, 0.6), grey = rgb(0.9, 0.91, 0.93), line = rgb(0.85, 0.87, 0.9);
  const TONE: Record<string, any> = { green: rgb(0.09, 0.5, 0.23), red: rgb(0.82, 0.15, 0.23), blue: rgb(0.12, 0.37, 0.84), bold: ink };
  let logo: any = null;
  try { const u = env("PORTAL_URL").replace(/\/+$/, ""); if (u) { const r = await fetch(`${u}/logo.png`); if (r.ok) logo = await doc.embedPng(new Uint8Array(await r.arrayBuffer())); } } catch { /* text header instead */ }
  let page: PDFPage, y = 0;
  const text = (s: string, x: number, yy: number, size = 9, f: PDFFont = reg, color = ink) => page.drawText(clean(s), { x, y: yy, size, font: f, color });
  const rText = (s: string, xr: number, yy: number, size = 9, f: PDFFont = reg, color = ink) => text(s, xr - f.widthOfTextAtSize(clean(s), size), yy, size, f, color);
  const wrap = (s: string, width: number, size: number, f: PDFFont) => {
    const words = clean(s).split(/\s+/); const out: string[] = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (f.widthOfTextAtSize(t, size) <= width || !cur) cur = t; else { out.push(cur); cur = w; } }
    if (cur) out.push(cur);
    return out.map((l) => { while (f.widthOfTextAtSize(l, size) > width && l.length > 1) l = l.slice(0, -1); return l; });
  };
  const header = () => {
    page = doc.addPage([W, H]); y = H - 36;
    if (logo) { const w = 150, h = (logo.height / logo.width) * w; page.drawImage(logo, { x: X, y: y - h + 8, width: w, height: h }); }
    else text(m.lab?.name ?? "", X, y - 10, 15, bold);
    rText(m.status ?? "FINAL", R, y, 10, bold, TONE.red);
    rText(m.lab?.phone ?? "", R, y - 12, 8.5, reg, blueLab);
    rText(m.lab?.address ?? "", R, y - 23, 8.5, reg, blueLab);
    y -= 50;
    page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.8, color: ink }); y -= 12;
    const pt = [["Patient", m.patient?.name], ["Birth", m.patient?.dob], ["Accession", m.accession], ["Patient #", m.patient?.mrn], ["Age", m.patient?.age], ["Collection Date", m.collected],
      ["Doctor", m.provider], ["Gender", m.patient?.gender ?? m.patient?.sex], ["Received Date", m.received], ["Organization", `${m.clinic ?? ""}${m.acct ? ` (${m.acct})` : ""}`], ["Diagnosis", m.icd], ["Reported Date", m.reported || "Pending"]];
    const cw = (R - X) / 3;
    for (let i = 0; i < pt.length; i += 3) {
      for (let j = 0; j < 3; j++) { const [k, v] = pt[i + j]; const x = X + j * cw; text(`${k}:`, x, y, 8, reg, mute); text(wrap(String(v ?? ""), cw - 70, 8, reg)[0] ?? "", x + 66, y, 8); }
      y -= 11;
    }
    y -= 6;
  };
  const need = (h: number) => { if (y - h < 56) header(); };
  header();
  if (m.flags?.crit) { need(18); page.drawRectangle({ x: X, y: y - 4, width: R - X, height: 15, color: rgb(0.99, 0.91, 0.92) }); text(`CRITICAL VALUE REPORTED (${m.flags.crit}). The laboratory will call your office.`, X + 6, y, 9, bold, TONE.red); y -= 20; }

  for (const b of m.blocks ?? []) {
    if (b.type === "break") { header(); continue; }
    if (b.type === "title") { need(34); y -= 6; const t = clean(b.text), w = bold.widthOfTextAtSize(t, 12); text(t, (W - w) / 2, y, 12, bold); page.drawLine({ start: { x: (W - w) / 2, y: y - 2 }, end: { x: (W + w) / 2, y: y - 2 }, thickness: 0.7, color: ink }); y -= 16; continue; }
    if (b.type === "lines") { for (const [k, v] of b.lines) { const kw = bold.widthOfTextAtSize(clean(`${k}: `), 8.5); wrap(String(v ?? ""), R - X - kw, 8.5, reg).forEach((l, i) => { need(12); if (i === 0) text(`${k}:`, X, y, 8.5, bold); text(l, X + kw, y, 8.5, reg); y -= 11; }); } page.drawLine({ start: { x: X, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.6, color: ink }); y -= 4; continue; }
    if (b.type === "list") {
      need(40); y -= 8; text(b.title, X, y, 8.8, bold); y -= 11;
      for (const l of wrap(b.text, R - X, 7.8, reg)) { need(10); text(l, X, y, 7.8, reg, mute); y -= 9.5; }
      for (const [g, v] of b.items) { const lab = `${g}: `, lw = bold.widthOfTextAtSize(clean(lab), 7.8); const ls = wrap(String(v), R - X - lw, 7.8, reg);
        ls.forEach((l, k) => { need(10); if (k === 0) text(lab, X, y, 7.8, bold, mute); text(l, X + lw, y, 7.8, reg, mute); y -= 9.5; }); }
      y -= 4; continue;
    }
    if (b.type === "note") { y -= 2; for (const l of wrap(b.text, R - X, 7.2, mono)) { need(9); text(l, X, y, 7.2, mono, mute); y -= 8.8; } y -= 4; continue; }
    // table
    const tot = b.widths.reduce((a: number, x: number) => a + x, 0), ws = b.widths.map((w: number) => (w / tot) * (R - X));
    const xs = ws.reduce((a: number[], w: number, i: number) => (a.push(i ? a[i - 1] + ws[i - 1] : X), a), []);
    const boxed = !b.big;
    const drawHead = (cont = false) => {
      if (b.title) {
        if (b.big) { need(40); y -= 6; text(b.title + (cont ? " (continued)" : ""), X, y, 12, bold); if (b.performedBy && !cont) rText(`Performed by ${b.performedBy}`, R, y, 7.5, reg, mute); y -= 5; page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.8, color: ink }); y -= 11; }
        else { need(34); y -= 9; const t = clean(String(b.title).toUpperCase() + (cont ? " (CONTINUED)" : "")), w = bold.widthOfTextAtSize(t, 7.8); text(t, (W - w) / 2, y, 7.8, bold); y -= 4; }
      }
      const hh = 12;
      if (boxed) { page.drawRectangle({ x: X, y: y - hh + 3, width: R - X, height: hh, color: grey, borderColor: ink, borderWidth: 0.6 }); }
      b.cols.forEach((c: string, i: number) => text(boxed ? c.toUpperCase() : c, xs[i] + 3, y - 6, 7.2, bold));
      y -= hh; if (!boxed) page.drawLine({ start: { x: X, y: y + 3 }, end: { x: R, y: y + 3 }, thickness: 0.6, color: ink });
    };
    need(40); drawHead();
    for (const r of b.rows) {
      if (r.group) { if (y - 30 < 56) { header(); drawHead(true); } y -= 3; text(r.group, X, y - 6, 8.3, bold); y -= 10; page.drawLine({ start: { x: X, y: y + 1 }, end: { x: R, y: y + 1 }, thickness: 0.6, color: ink }); y -= 1; continue; }
      const cells = r.cells.map((c: string, i: number) => wrap(String(c ?? ""), ws[i] - 6, 8, r.tone?.[i] ? bold : reg));
      const lines = Math.max(1, ...cells.map((c: string[]) => c.length)), h = lines * 9.6 + 3;
      if (y - h < 56) { header(); drawHead(true); }
      cells.forEach((c: string[], i: number) => c.forEach((l, k) => text(l, xs[i] + 3, y - 8 - k * 9.6, 8, r.tone?.[i] ? bold : reg, r.tone?.[i] ? TONE[r.tone[i]] : ink)));
      if (boxed) { page.drawRectangle({ x: X, y: y - h, width: R - X, height: h, borderColor: ink, borderWidth: 0.5 }); xs.slice(1).forEach((x: number) => page.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness: 0.5, color: ink })); }
      else page.drawLine({ start: { x: X, y: y - h }, end: { x: R, y: y - h }, thickness: 0.4, color: line });
      y -= h;
    }
    y -= 6;
  }
  need(30); y -= 6;
  const foot = `Laboratory Director: ${m.lab?.director ?? ""}${m.lab?.clia ? `   CLIA ID# ${m.lab.clia}` : ""}`;
  text(foot, (W - reg.widthOfTextAtSize(clean(foot), 8.5)) / 2, y, 8.5, reg); y -= 11;
  const conf = `CONFIDENTIAL: protected health information for ${m.clinic ?? "the ordering provider"}. If received in error, call ${m.lab?.phone ?? "the laboratory"} and destroy all copies.`;
  for (const l of wrap(conf, R - X, 7.5, reg)) { text(l, X, y, 7.5, reg, mute); y -= 9; }

  const pages = doc.getPages(), printed = new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" });
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: X, y: 40 }, end: { x: R, y: 40 }, thickness: 0.6, color: ink });
    pg.drawText(clean(`Printed: ${printed} (Arizona)`), { x: X, y: 28, size: 7.5, font: reg, color: mute });
    const r1 = clean(`Accession: ${m.accession ?? ""}   Patient #: ${m.patient?.mrn ?? ""}`), r2 = `Page ${i + 1}/${pages.length}`;
    pg.drawText(r1, { x: R - reg.widthOfTextAtSize(r1, 7.5), y: 30, size: 7.5, font: reg, color: mute });
    pg.drawText(r2, { x: R - reg.widthOfTextAtSize(r2, 7.5), y: 20, size: 7.5, font: reg, color: mute });
  });
  return await doc.save();
}
