// instrument-upload: receives instrument export files from the FBG bridge on the lab PC.
// Deploy with JWT verification OFF. Each request must carry a device key (x-device-key) created in
// Lab settings > Instrument bridge. Only a hash of the key is stored. Files land in instrument_inbox
// for a scientist to review and import; nothing is imported automatically.
// Amico DX's connector uses this same endpoint (with an 'amico' key) to return HL7 results.
import { createClient } from "npm:@supabase/supabase-js@2";

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
  const { data: dev } = await admin.from("instrument_devices").select("*").eq("token_hash", await sha256(key)).maybeSingle();
  if (!dev || !dev.active) return json({ error: "Unknown or inactive device." }, 401);
  await admin.from("instrument_devices").update({ last_seen: new Date().toISOString() }).eq("id", dev.id);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Send JSON: {instrument, fileName, content (base64)}." }, 400); }
  if (body && body.ping) return json({ ok: true, device: dev.name });
  const instrument = String(body?.instrument ?? "").toLowerCase();
  const fileName = String(body?.fileName ?? "").slice(0, 200);
  const content = String(body?.content ?? "");
  if (!KINDS.includes(instrument)) return json({ error: `instrument must be one of ${KINDS.join(", ")}.` }, 400);
  // The Amico DX connector may only send back HL7 result files.
  if (dev.scope === "amico" && instrument !== "hl7") return json({ error: "Amico DX connector keys can only send HL7 results." }, 403);
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
