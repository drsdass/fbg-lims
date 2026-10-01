// referral-feed: hands queued Amico DX referrals (HL7 ORM^O01) to the connector on Amico's Icarus computer.
// Deploy with JWT verification OFF. Every request must carry an Amico device key (x-device-key) created in
// Lab settings > Amico DX referrals > Connect Amico's computer. Only a hash of the key is stored.
//
//   POST {ping: true}                                     -> {ok, device}
//   POST {action: "pull", limit?}                         -> {messages: [{id, accession, manifest, tests, message}]}
//        Returns referrals that are queued, plus any delivered more than 10 minutes ago without an answer
//        (so a crash between download and acknowledgement never loses an order). Marks them delivered.
//   POST {action: "ack", id, status: "accepted"|"rejected", note?}
//        "accepted" = Icarus took the order. "rejected" = Icarus refused it; note says why. FBG staff see both.
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const REDELIVER_MS = 10 * 60 * 1000;

async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const key = req.headers.get("x-device-key") ?? "";
  if (key.length < 32) return json({ error: "Missing device key." }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: dev } = await admin.from("instrument_devices").select("id,active,name,scope").eq("token_hash", await sha256(key)).maybeSingle();
  if (!dev || !dev.active) return json({ error: "Unknown or inactive device." }, 401);
  if (dev.scope !== "amico") return json({ error: "This key isn't an Amico DX connector key." }, 403);
  await admin.from("instrument_devices").update({ last_seen: new Date().toISOString() }).eq("id", dev.id);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }
  if (body?.ping) return json({ ok: true, device: dev.name });

  if (body?.action === "pull") {
    const limit = Math.min(Math.max(parseInt(body.limit) || 50, 1), 200);
    const stale = new Date(Date.now() - REDELIVER_MS).toISOString();
    const { data: rows, error } = await admin.from("referrals")
      .select("id,accession,manifest,tests,message,attempts")
      .eq("dest", "amico")
      .or(`status.eq.queued,and(status.eq.delivered,delivered_at.lt.${stale})`)
      .order("created_at", { ascending: true }).limit(limit);
    if (error) return json({ error: error.message }, 500);
    const now = new Date().toISOString();
    for (const r of rows ?? []) {
      await admin.from("referrals").update({ status: "delivered", delivered_at: now, attempts: (r.attempts ?? 0) + 1 }).eq("id", r.id);
    }
    if (rows?.length) {
      await admin.from("audit_log").insert({ actor: null, action: "send", tbl: "referrals", row_id: null, detail: { device: dev.name, count: rows.length, accessions: rows.map((r) => r.accession) } });
    }
    return json({ messages: (rows ?? []).map(({ attempts, ...r }) => r) });
  }

  if (body?.action === "ack") {
    const id = String(body.id ?? ""), status = String(body.status ?? "");
    if (!id || !["accepted", "rejected"].includes(status)) return json({ error: "ack needs id and status accepted or rejected." }, 400);
    const note = body.note ? String(body.note).slice(0, 500) : null;
    const { data: cur } = await admin.from("referrals").select("status").eq("id", id).maybeSingle();
    if (!cur) return json({ error: "Unknown referral." }, 404);
    if (cur.status === "cancelled") return json({ ok: true, cancelled: true });
    const { error } = await admin.from("referrals").update({ status, note, acked_at: new Date().toISOString() }).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Unknown action. Use ping, pull or ack." }, 400);
});
