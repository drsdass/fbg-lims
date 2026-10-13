// patient-access: lets a patient create a portal account, or add results to their account,
// using the access code printed on their requisition/report plus their last name and date of birth.
// Deploy with JWT verification OFF (registration happens before the patient has an account).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
const GENERIC = "We couldn't match that code, last name and date of birth. Check them against your paperwork and try again.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let b: any; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const code = String(b?.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  // Throttle guessing: at most 8 failed attempts per IP address per hour.
  const since = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await admin.from("audit_log").select("id", { count: "exact", head: true })
    .eq("action", "patient_access_failed").eq("row_id", ip).gte("at", since);
  if ((count ?? 0) >= 8) return json({ error: "Too many attempts. Try again in an hour or call the lab." }, 429);
  const fail = async (why: string) => { await admin.from("audit_log").insert({ actor: null, action: "patient_access_failed", tbl: "patient_access", row_id: ip, detail: { why } }); return json({ error: GENERIC }, 400); };

  if (code.length < 8) return fail("short code");
  const { data: orders } = await admin.from("orders").select("id,data").filter("data->>accessCode", "eq", code).limit(1);
  const order = orders && orders[0];
  if (!order) return fail("no such code");
  const { data: pt } = await admin.from("patients").select("id,data").eq("id", order.data.patientId).maybeSingle();
  if (!pt || norm(pt.data.last) !== norm(b?.lastName) || String(pt.data.dob) !== String(b?.dob ?? "").trim()) return fail("identity mismatch");

  if (b.action === "link") {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Sign in first." }, 401);
    const { data: prof } = await admin.from("profiles").select("role,patient_ids").eq("user_id", u.user.id).maybeSingle();
    if (!prof || prof.role !== "patient") return json({ error: "Only patient accounts can add results." }, 403);
    const ids = Array.from(new Set([...(prof.patient_ids ?? []), pt.id]));
    const { error } = await admin.from("profiles").update({ patient_ids: ids }).eq("user_id", u.user.id);
    if (error) return json({ error: error.message }, 500);
    await admin.from("audit_log").insert({ actor: u.user.id, action: "update", tbl: "profiles", row_id: u.user.id, detail: { linked_patient: pt.id, order: order.id } });
    return json({ ok: true });
  }

  // register
  const email = String(b?.email ?? "").trim().toLowerCase(), password = String(b?.password ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (password.length < 12) return json({ error: "Use a password of at least 12 characters." }, 400);
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `${pt.data.first} ${pt.data.last}` } });
  if (cErr || !created?.user) {
    if (/already|registered|exists/i.test(cErr?.message ?? "")) return json({ error: "That email already has an account. Sign in, then use Add results with this code." }, 409);
    return json({ error: cErr?.message ?? "Couldn't create the account." }, 500);
  }
  const { error: pErr } = await admin.from("profiles").insert({ user_id: created.user.id, role: "patient", name: `${pt.data.first} ${pt.data.last}`, email, active: true, patient_ids: [pt.id] });
  if (pErr) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: pErr.message }, 500); }
  await admin.from("audit_log").insert({ actor: created.user.id, action: "create", tbl: "profiles", row_id: created.user.id, detail: { patient_portal: true, patient: pt.id, order: order.id } });
  return json({ ok: true });
});
