// instrument-upload: receives instrument export files from the FBG bridge on the lab PC.
// Deploy with JWT verification OFF. Each request must carry a device key (x-device-key) created in
// Lab settings > Instrument bridge. Only a hash of the key is stored. Files land in instrument_inbox
// for a scientist to review and import; nothing is imported automatically.
// It also answers the Yumizen C560's host queries ({action: "c560-query"}) that the bridge forwards: the analyzer scans a
// tube, asks which tests to run, and gets back DSR^Q03 messages built from the order (see c560.ts).
import { createClient } from "npm:@supabase/supabase-js@2";
import { answer, barcodeKeys, parse14, parseQuery, sampleFromOrder, ts14 } from "./c560.ts";

const MAX_BYTES = 15 * 1024 * 1024;
const KINDS = ["c560", "sciex", "hl7"];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const key = req.headers.get("x-device-key") ?? "";
  if (key.length < 32) return json({ error: "Missing device key." }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: dev } = await admin.from("instrument_devices").select("id,active,name").eq("token_hash", await sha256(key)).maybeSingle();
  if (!dev || !dev.active) return json({ error: "Unknown or inactive device." }, 401);
  await admin.from("instrument_devices").update({ last_seen: new Date().toISOString() }).eq("id", dev.id);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Send JSON: {instrument, fileName, content (base64)}." }, 400); }
  if (body && body.ping) return json({ ok: true, device: dev.name });
  if (body && body.action === "c560-query") {
    try { return json(await c560Query(admin, body, dev.name)); } catch (e) { return json({ found: false, messages: [], error: String((e as Error).message || e) }, 500); }
  }
  const instrument = String(body?.instrument ?? "").toLowerCase();
  const fileName = String(body?.fileName ?? "").slice(0, 200);
  const content = String(body?.content ?? "");
  if (!KINDS.includes(instrument)) return json({ error: `instrument must be one of ${KINDS.join(", ")}.` }, 400);
  if (!fileName || !content) return json({ error: "fileName and content are required." }, 400);
  if (!/\.(csv|txt|xlsx|xls|hl7)$/i.test(fileName)) return json({ error: "Only .csv, .txt, .xlsx, .xls or .hl7 files are accepted." }, 400);
  const size = Math.floor((content.length * 3) / 4);
  if (size > MAX_BYTES) return json({ error: "File is larger than 15 MB." }, 413);

  // The same file sent twice (for example after a network retry) is stored once.
  const { data: dup } = await admin.from("instrument_inbox").select("id").eq("instrument", instrument).eq("file_name", fileName).eq("size", size).limit(1);
  if (dup && dup.length) return json({ ok: true, duplicate: true, id: dup[0].id });

  const { data, error } = await admin.from("instrument_inbox").insert({ device_id: dev.id, instrument, file_name: fileName, size, content }).select("id").single();
  if (error) return json({ error: error.message }, 500);
  await admin.from("audit_log").insert({ actor: null, action: "create", tbl: "instrument_inbox", row_id: data.id, detail: { device: dev.name, instrument, fileName, size } });
  return json({ ok: true, id: data.id });
});

const DAY = 864e5;
async function c560Query(admin: any, body: any, device: string) {
  const { data: st } = await admin.from("settings").select("data").eq("key", "lab").maybeSingle();
  const set = (st && st.data && st.data.c560) || {};
  if (!(set.tests || []).some((t: any) => t && t.channel)) return { found: false, messages: [], note: "No channel numbers are set in Lab settings > Yumizen C560 interface." };
  const q = body.raw ? parseQuery(String(body.raw)) : { ctrl: String(body.ctrl || ""), barcode: String(body.barcode || ""), from: String(body.from || ""), to: String(body.to || ""), sampleFrom: String(body.sampleFrom || ""), sampleTo: String(body.sampleTo || "") };
  let orders: any[] = [];
  const keys = barcodeKeys(q.barcode);
  if (keys.length) {
    const ors = keys.flatMap((k) => [`data->>accession.ilike.${k}`, `data->>vialBarcode.ilike.${k}`]).join(",");
    const { data, error } = await admin.from("orders").select("id,data").or(ors).limit(5);
    if (error) throw error;
    orders = (data || []).map((r: any) => r.data);
  } else if (q.from || q.to) {
    // Batch download for a time window: specimens received in that window with screens still to run.
    const from = parse14(q.from) ?? Date.now() - DAY, to = parse14(q.to) ?? Date.now();
    const { data, error } = await admin.from("orders").select("id,data").in("data->>status", ["Received", "In Process"]).contains("data", { tests: ["UDS"] }).limit(1000);
    if (error) throw error;
    orders = (data || []).map((r: any) => r.data).filter((o: any) => { const h = (o.history || []).find((x: any) => x && x.s === "Received"); return h && h.at >= from && h.at <= to; });
  }
  // Sample ID range queries refer to the analyzer's own numbering, which the portal doesn't know: answer "not found".
  const ids = [...new Set(orders.map((o) => o.patientId).filter(Boolean))];
  const pts: Record<string, any> = {};
  if (ids.length) { const { data } = await admin.from("patients").select("id,data").in("id", ids); (data || []).forEach((r: any) => { pts[r.id] = r.data; }); }
  const samples = orders.map((o) => sampleFromOrder(o, pts[o.patientId], set, keys.length ? q.barcode : undefined)).filter(Boolean).slice(0, 100) as any[];
  await admin.from("audit_log").insert({ actor: null, action: "c560_query", tbl: "orders", row_id: samples.length === 1 ? samples[0].barcode : null, detail: { device, barcode: q.barcode || null, from: q.from || null, to: q.to || null, found: samples.length } });
  return { found: samples.length > 0, messages: answer(q.ctrl, samples, ts14(Date.now())), samples: samples.map((s) => ({ barcode: s.barcode, tests: s.tests.length })) };
}
