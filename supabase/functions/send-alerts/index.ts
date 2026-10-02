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

  // Tell Amico DX that electronic orders and a box of specimens are on the way. The address comes from Lab settings
  // (never from the request), and the message carries counts only: no names, dates of birth or accession numbers.
  if (body.action === "referral") {
    const { data: st } = await admin.from("settings").select("data").eq("key", "lab").maybeSingle();
    const am = st?.data?.amico ?? {}, lab = st?.data ?? {};
    const to = String(am.email ?? "").split(/[,;\s]+/).map((x: string) => x.trim()).filter(Boolean);
    if (!to.length) return json({ ok: false, error: "No Amico DX notification email in Lab settings." });
    const from = env("ALERT_FROM");
    if (!from) return json({ ok: false, error: "Email isn't set up: add the ALERT_FROM secret." });
    const manifest = String(body.manifest ?? "").replace(/[^A-Z0-9-]/gi, "").slice(0, 40);
    const n = Math.max(0, parseInt(body.specimens) || 0);
    const tests = (Array.isArray(body.tests) ? body.tests : []).map((t: unknown) => String(t).slice(0, 60)).slice(0, 30);
    const text = [
      `${lab.name || "First Bio Genetics"} has sent ${n} specimen${n === 1 ? "" : "s"} to ${am.name || "Amico DX"} on manifest ${manifest}.`,
      "",
      tests.length ? `Tests: ${tests.join(", ")}` : "",
      "The electronic orders are waiting for Icarus. If the Amico DX connector is running they will appear automatically;",
      "otherwise check the connector log on the Icarus computer.",
      "",
      `Questions: ${lab.phone || ""} ${lab.email || ""}`.trim(),
      "",
      "This message contains no patient information.",
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
    try {
      await resend({ from, to, subject: `Incoming referral ${manifest} - ${n} specimen${n === 1 ? "" : "s"} from ${lab.name || "First Bio Genetics"}`, text });
      await admin.from("audit_log").insert({ actor: u.user.id, action: "send", tbl: "referrals", row_id: manifest, detail: { channel: "Email", to, specimens: n } });
      return json({ ok: true, detail: `Emailed ${to.join(", ")}` });
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
// First Bio Genetics logo, embedded so faxes and downloads always carry it (public/logo.png).
const LOGO_PNG_B64 = "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";
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
  try { logo = await doc.embedPng(Uint8Array.from(atob(LOGO_PNG_B64), (c) => c.charCodeAt(0))); } catch { /* fall back to the lab name in text */ }
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
    const info = [m.lab?.address, [m.lab?.phone, m.lab?.email].filter(Boolean).join("   "), m.lab?.clia ? `CLIA ${m.lab.clia}` : "", m.lab?.director ? `Laboratory Director: ${m.lab.director}` : ""].filter(Boolean);
    info.forEach((l, i) => rText(l, R, y - 12 - i * 10, 8, reg, blueLab));
    y -= Math.max(50, 18 + info.length * 10);
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
    // ---------- visual summary blocks (drawn in vector so they print and fax cleanly) ----------
    const C = {
      okBg: rgb(0.93, 0.97, 0.95), okBd: rgb(0.61, 0.81, 0.67), ok: rgb(0.08, 0.5, 0.24),
      warnBg: rgb(0.99, 0.96, 0.91), warnBd: rgb(0.91, 0.76, 0.49), warn: rgb(0.57, 0.25, 0.05),
      badBg: rgb(0.99, 0.93, 0.93), badBd: rgb(0.92, 0.64, 0.67), bad: rgb(0.63, 0.11, 0.17),
      card: rgb(0.965, 0.97, 0.976), cardBd: rgb(0.79, 0.81, 0.85), track: rgb(0.906, 0.918, 0.937), band: rgb(0.75, 0.89, 0.78),
    };
    const tone = (t: string) => t === "ok" ? [C.okBg, C.okBd, C.ok] : t === "warn" ? [C.warnBg, C.warnBd, C.warn] : t === "bad" ? [C.badBg, C.badBd, C.bad] : [C.card, C.cardBd, ink];
    const secTitle = (t: string, room = 40) => {
      need(room); y -= 8; text(t, X, y, 10, bold); y -= 4;
      page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.7, color: ink }); y -= 4;
    };
    // little symbols that still read in black and white
    const sym = (kind: string, x: number, cy: number, col: any) => {
      if (kind === "tri") page.drawSvgPath("M0 -4 L4 3 L-4 3 Z", { x, y: cy, color: col });
      else if (kind === "dot") page.drawCircle({ x, y: cy, size: 2.8, color: col });
      else if (kind === "check") { page.drawLine({ start: { x: x - 3, y: cy }, end: { x: x - 1, y: cy - 2.5 }, thickness: 1.3, color: col }); page.drawLine({ start: { x: x - 1, y: cy - 2.5 }, end: { x: x + 3.5, y: cy + 3 }, thickness: 1.3, color: col }); }
      else if (kind === "x") { page.drawLine({ start: { x: x - 3, y: cy - 3 }, end: { x: x + 3, y: cy + 3 }, thickness: 1.3, color: col }); page.drawLine({ start: { x: x - 3, y: cy + 3 }, end: { x: x + 3, y: cy - 3 }, thickness: 1.3, color: col }); }
      else if (kind === "dash") page.drawLine({ start: { x: x - 3, y: cy }, end: { x: x + 3, y: cy }, thickness: 1.3, color: col });
    };
    if (b.type === "glance") {
      const per = 4, gap = 6, cw2 = (R - X - gap * (per - 1)) / per, ch = 46;
      for (let i = 0; i < b.cards.length; i += per) {
        need(ch + 8); y -= 4;
        b.cards.slice(i, i + per).forEach((c: any, j: number) => {
          const [bg, bd, fg] = tone(c.tone), x = X + j * (cw2 + gap);
          page.drawRectangle({ x, y: y - ch, width: cw2, height: ch, color: bg, borderColor: bd, borderWidth: 0.8 });
          const sk = c.tone === "bad" ? "tri" : c.tone === "warn" ? "dot" : c.tone === "ok" ? "check" : "";
          if (sk) sym(sk, x + 9, y - 10, fg);
          text(wrap(c.label, cw2 - 22, 7.8, bold)[0] ?? "", x + (sk ? 16 : 7), y - 12, 7.8, bold, c.tone ? fg : mute);
          text(c.value, x + 7, y - 28, 14, bold, c.tone === "ok" ? ink : fg);
          text(wrap(c.sub || "", cw2 - 12, 7, reg)[0] ?? "", x + 7, y - 39, 7, reg, mute);
        });
        y -= ch + 4;
      }
      continue;
    }
    if (b.type === "markers") {
      secTitle(b.title);
      const cN = X, cV = X + 128, cB = X + 236, bw = 200, cS = cB + bw + 14, sw = R - cS - 4;
      const head = () => { text("Test", cN, y - 7, 7, bold, mute); text("Result", cV, y - 7, 7, bold, mute); text("Where it falls in the reference range", cB, y - 7, 7, bold, mute); text("Previous", cS, y - 7, 7, bold, mute); y -= 11; };
      head();
      for (const r of b.rows) {
        const h = 20;
        if (y - h < 56) { header(); secTitle(b.title + " (continued)"); head(); }
        const cy = y - 10, out = !!r.flag, f = out ? bold : reg;
        text(wrap(r.name, 124, 8, f)[0] ?? "", cN, cy - 3, 8, f);
        const vs = `${r.disp}`; text(vs, cV, cy - 3, 8, f);
        let vx2 = cV + f.widthOfTextAtSize(clean(vs), 8) + 3;
        if (r.unit) { text(r.unit, vx2, cy - 3, 6.5, reg, mute); vx2 += reg.widthOfTextAtSize(clean(r.unit), 6.5) + 4; }
        if (out) { const lab = r.flag === "L" ? "LOW" : r.flag === "C" ? "CRITICAL" : "HIGH", lw = bold.widthOfTextAtSize(lab, 6.5);
          page.drawRectangle({ x: vx2 - 1.5, y: cy - 5, width: lw + 4, height: 8.5, borderColor: C.warnBd, borderWidth: 0.7 }); text(lab, vx2 + 0.5, cy - 3, 6.5, bold, r.flag === "C" ? C.bad : C.warn); }
        // range bar
        let lo = r.lo, hi = r.hi; if (lo == null) lo = 0; if (hi == null) hi = lo * 2 || 1;
        const span = (hi - lo) || Math.abs(hi) || 1, mn = Math.min(lo - span * 0.6, r.v - span * 0.1), mx = Math.max(hi + span * 0.6, r.v + span * 0.1);
        const px = (v: number) => cB + 4 + (v - mn) / (mx - mn) * (bw - 8);
        page.drawRectangle({ x: cB + 4, y: cy - 2.5, width: bw - 8, height: 5, color: C.track });
        page.drawRectangle({ x: px(lo), y: cy - 2.5, width: Math.max(1.5, px(hi) - px(lo)), height: 5, color: C.band });
        if (r.lo != null) page.drawLine({ start: { x: px(lo), y: cy - 5 }, end: { x: px(lo), y: cy + 5 }, thickness: 0.7, color: mute });
        if (r.hi != null) page.drawLine({ start: { x: px(hi), y: cy - 5 }, end: { x: px(hi), y: cy + 5 }, thickness: 0.7, color: mute });
        const vxp = Math.max(cB + 5, Math.min(cB + bw - 5, px(r.v)));
        if (out) page.drawSvgPath("M0 -5.5 L5.5 0 L0 5.5 L-5.5 0 Z", { x: vxp, y: cy, color: r.flag === "C" ? C.bad : C.warn, borderColor: ink, borderWidth: 0.6 });
        else page.drawCircle({ x: vxp, y: cy, size: 4, color: rgb(1, 1, 1), borderColor: C.ok, borderWidth: 1.8 });
        // mini trend
        const pts = [...(r.hist || []).map((h: any) => h.v), r.v];
        if (pts.length < 2) text("First result", cS, cy - 3, 6.5, reg, mute);
        else {
          const w2 = Math.min(56, sw - 4), lo2 = Math.min(...pts), hi2 = Math.max(...pts), rg = (hi2 - lo2) || 1;
          const P = pts.map((v: number, i: number) => ({ x: cS + i * w2 / (pts.length - 1), y: cy - 1 - 6 + (v - lo2) / rg * 12 }));
          for (let i = 1; i < P.length; i++) page.drawLine({ start: P[i - 1], end: P[i], thickness: 0.9, color: mute });
          P.forEach((p: any, i: number) => page.drawCircle({ x: p.x, y: p.y, size: i === P.length - 1 ? 1.8 : 1.1, color: i === P.length - 1 ? ink : mute }));
          const pv = r.hist[r.hist.length - 1]; text(`${pv.v} on ${pv.d}`, cS + w2 + 4, cy - 3, 6.2, reg, mute);
        }
        page.drawLine({ start: { x: X, y: y - h }, end: { x: R, y: y - h }, thickness: 0.3, color: line });
        y -= h;
      }
      y -= 4;
      continue;
    }
    if (b.type === "meds") {
      secTitle(b.title);
      const K: any = { consistent: ["check", "Consistent", C.ok], inconsistent: ["x", "Not detected", C.warn], unexpected: ["tri", "Unexpected", C.bad], nottested: ["dash", "Not tested", mute], pending: ["dash", "Pending", mute] };
      for (const r of b.rows) {
        const k = K[r.status] || K.pending, ls = wrap(r.detail, R - X - 230, 8, reg), h = Math.max(1, ls.length) * 9.6 + 4;
        need(h);
        sym(k[0], X + 6, y - 6, k[2]);
        text(wrap(r.rx, 120, 8, bold)[0] ?? "", X + 16, y - 9, 8, bold);
        ls.forEach((l: string, i: number) => text(l, X + 140, y - 9 - i * 9.6, 8, reg, mute));
        rText(k[1], R, y - 9, 8, bold, k[2]);
        page.drawLine({ start: { x: X, y: y - h }, end: { x: R, y: y - h }, thickness: 0.3, color: line });
        y -= h;
      }
      y -= 4;
      continue;
    }
    if (b.type === "micro") {
      secTitle(b.title);
      if (!b.orgs.length) {
        need(14); sym("check", X + 5, y - 6, C.ok); text(`No targets detected (${b.notDetected} tested).`, X + 14, y - 9, 8.5, bold, C.ok); y -= 16;
      } else {
        const c1 = X, c2 = X + (R - X) * 0.27, c3 = X + (R - X) * 0.70, w1 = c2 - c1 - 8, w2 = c3 - c2 - 8, w3 = R - c3 - 4;
        const head = () => {
          text("Organism detected", c1 + 3, y - 8, 7.5, bold); text(b.guide ? "Options to consider" : "Treatment options", c2 + 3, y - 8, 7.5, bold); text("Likely ineffective", c3 + 3, y - 8, 7.5, bold);
          y -= 11; page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.6, color: ink });
        };
        need(40); head();
        for (const o2 of b.orgs) {
          // build each column as a list of drawable lines: [text, font, size, color, strike?]
          const L1: any[] = [[o2.name, bold, 8.3, C.bad]]; if (o2.group) L1.push([o2.group, reg, 7, mute]);
          const wrapL = (s: string, w: number, f: any, sz: number, col: any, st = false) => wrap(s, w, sz, f).map((l: string) => [l, f, sz, col, st]);
          const L1w = L1.flatMap(([t, f, sz, col]) => wrapL(t, w1 - 10, f, sz, col));
          const ok = o2.options.filter((op: any) => !op.struck), no = o2.options.filter((op: any) => op.struck);
          const L2: any[] = ok.length ? ok.flatMap((op: any) => {
            const one = `${op.drug}  `, fits = bold.widthOfTextAtSize(clean(one), 8) + reg.widthOfTextAtSize(clean(op.cls), 6.8) <= w2;
            const rows: any[] = fits ? [[op.drug, bold, 8, ink, false, op.cls]] : [...wrapL(op.drug, w2, bold, 8, ink), ...wrapL(op.cls, w2, reg, 6.8, mute)];
            if (op.note) rows.push(...wrapL(op.note, w2, reg, 6.8, mute));
            return rows;
          }) : [[b.guide ? "No options listed in the therapy guide." : "See note below.", reg, 7.5, mute]];
          const L3: any[] = no.length ? no.flatMap((op: any) => [...wrapL(op.drug, w3 - 10, bold, 8, C.bad, true), ...wrapL(`${op.why} detected`, w3 - 10, reg, 6.8, C.bad)]) : [["-", reg, 8, mute]];
          const lh = 9.6, h = Math.max(L1w.length, L2.length, L3.length) * lh + 6;
          if (y - h < 56) { header(); secTitle(b.title + " (continued)"); head(); }
          const top = y - 9;
          sym("tri", c1 + 4, top + 2.5, C.bad);
          L1w.forEach(([t, f, sz, col]: any, i: number) => text(t, c1 + 11, top - i * lh, sz, f, col));
          L2.forEach(([t, f, sz, col, , extra]: any, i: number) => { text(t, c2 + 3, top - i * lh, sz, f, col); if (extra) text(extra, c2 + 3 + f.widthOfTextAtSize(clean(`${t}  `), sz), top - i * lh, 6.8, reg, mute); });
          let xi = 0;
          L3.forEach(([t, f, sz, col, st]: any, i: number) => {
            const xx = c3 + 3 + (st ? 9 : 9);
            if (st && f === bold && (i === 0 || L3[i - 1][1] !== bold)) sym("x", c3 + 6, top - i * lh + 2.5, C.bad);
            text(t, xx, top - i * lh, sz, f, col);
            if (st) page.drawLine({ start: { x: xx, y: top - i * lh + 2.6 }, end: { x: xx + f.widthOfTextAtSize(clean(t), sz), y: top - i * lh + 2.6 }, thickness: 0.6, color: C.bad });
            xi++;
          });
          y -= h;
          page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.4, color: line });
        }
        y -= 4;
      }
      if (b.genes.length) {
        const ls = wrap(b.genes.map((g: any) => `${g.label}${g.note ? ` - ${g.note.replace(/\.$/, "")}` : ""}`).join("; "), R - X - 14, 8, reg), h = (ls.length + 1) * 10 + 6;
        need(h + 4);
        page.drawRectangle({ x: X, y: y - h, width: R - X, height: h, color: C.warnBg });
        page.drawRectangle({ x: X, y: y - h, width: 2.5, height: h, color: C.warnBd });
        text("Resistance genes detected", X + 9, y - 10, 8, bold, C.warn);
        ls.forEach((l: string, i: number) => text(l, X + 9, y - 20 - i * 10, 8, reg, ink));
        y -= h + 5;
      }
      const cav = [b.orgs.length && b.notDetected ? `${b.notDetected} other targets not detected.` : "", b.caveat, b.orgs.length && !b.guide ? "Therapy considerations are not shown: the laboratory's therapy guide has not been approved." : ""].filter(Boolean).join(" ");
      for (const l of wrap(cav, R - X, 7.2, reg)) { need(9); text(l, X, y - 6, 7.2, reg, mute); y -= 8.8; }
      y -= 4;
      continue;
    }
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
  if (m.esign) { need(12); text(m.esign, (W - bold.widthOfTextAtSize(clean(m.esign), 8)) / 2, y, 8, bold); y -= 11; }
  const conf = `CONFIDENTIAL: protected health information for ${m.clinic ?? "the ordering provider"}. If received in error, call ${m.lab?.phone ?? "the laboratory"} and destroy all copies.`;
  for (const l of wrap(conf, R - X, 7.5, reg)) { text(l, X, y, 7.5, reg, mute); y -= 9; }

  const pages = doc.getPages(), printed = new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" });
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: X, y: 40 }, end: { x: R, y: 40 }, thickness: 0.6, color: ink });
    const idl = clean([m.lab?.name, m.lab?.clia ? `CLIA ${m.lab.clia}` : "", m.lab?.director ? `Director: ${m.lab.director}` : ""].filter(Boolean).join("   "));
    pg.drawText(idl, { x: X, y: 30, size: 7.5, font: bold, color: mute });
    pg.drawText(clean(`Printed: ${printed} (Arizona)`), { x: X, y: 20, size: 7.5, font: reg, color: mute });
    const r1 = clean(`Accession: ${m.accession ?? ""}   Patient #: ${m.patient?.mrn ?? ""}`), r2 = `Page ${i + 1}/${pages.length}`;
    pg.drawText(r1, { x: R - reg.widthOfTextAtSize(r1, 7.5), y: 30, size: 7.5, font: reg, color: mute });
    pg.drawText(r2, { x: R - reg.widthOfTextAtSize(r2, 7.5), y: 20, size: 7.5, font: reg, color: mute });
  });
  return await doc.save();
}
