// eligibility: real-time insurance eligibility checks (X12 270/271) through the Stedi clearinghouse.
// The portal uses it to learn whether a patient's plan is active and whether it is an HMO, PPO, EPO or POS.
// Secrets (Supabase > Edge Functions > Secrets):
//   STEDI_API_KEY          required. A production key from the Stedi portal (a test key returns Stedi's mock answers).
//   STEDI_ELIGIBILITY_URL  optional. Defaults to Stedi's JSON eligibility endpoint below.
// Callers must be signed-in, active lab users with two-step verification. Every check is written to the audit log
// (payer and outcome only, no member details).
import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const SB_URL = env("SUPABASE_URL");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
const KEY = env("STEDI_API_KEY");
const ELIG_URL = env("STEDI_ELIGIBILITY_URL") || "https://healthcare.us.stedi.com/2026-06-01/eligibility-check";
const SEARCH_URLS = ["https://healthcare.us.stedi.com/2024-04-01/payers/search", "https://payers.us.stedi.com/2024-04-01/payers/search"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const stedi = (url: string, init: RequestInit = {}) =>
  fetch(url, { ...init, headers: { Authorization: KEY, "Content-Type": "application/json", ...(init.headers ?? {}) } });

async function searchPayers(query: string) {
  for (const base of SEARCH_URLS) {
    const r = await stedi(`${base}?query=${encodeURIComponent(query.slice(0, 200))}&eligibilityCheck=EITHER&pageSize=10`);
    if (r.status === 404) continue;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `Payer search failed (${r.status}).`);
    return (j.items ?? []).map((it: any) => ({
      id: it.payer?.primaryPayerId ?? "", stediId: it.payer?.stediId ?? "", name: it.payer?.displayName ?? "",
      eligibility: it.payer?.transactionSupport?.eligibilityCheck ?? "",
    }));
  }
  return [];
}
const dobIso = (s: string) => { const m = String(s || "").match(/^(\d{4})-?(\d{2})-?(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return json({ error: "Not signed in" }, 401);
  let aal = "";
  try { aal = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal; } catch { /* ignore */ }
  if (aal !== "aal2") return json({ error: "Two-step verification required" }, 403);
  const { data: me } = await admin.from("profiles").select("role,active").eq("user_id", u.user.id).maybeSingle();
  if (!me || me.role !== "lab" || !me.active) return json({ error: "Only lab staff can check eligibility" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  try {
    switch (body.action) {
      case "status":
        return json({ configured: !!KEY, version: 1 });
      case "payers":
        if (!KEY) return json({ configured: false, error: "Eligibility checks aren't set up. Add STEDI_API_KEY in Supabase." });
        return json({ payers: await searchPayers(String(body.query ?? "")) });
      case "check": {
        if (!KEY) return json({ configured: false, error: "Eligibility checks aren't set up. Add STEDI_API_KEY in Supabase." });
        const npi = String(body.npi ?? "").trim(), org = String(body.org ?? "First Bio Genetics").trim();
        if (!/^\d{10}$/.test(npi)) throw new Error("Add the lab's NPI in Lab settings first.");
        const memberId = String(body.memberId ?? "").trim(), first = String(body.first ?? "").trim(), last = String(body.last ?? "").trim(), dob = dobIso(body.dob);
        if (!memberId || !last || !dob) throw new Error("A member ID, last name and date of birth are needed.");
        let payerId = String(body.payerId ?? "").trim(), payerName = String(body.payerName ?? "").trim();
        if (!payerId) {
          const hits = (await searchPayers(payerName)).filter((p: any) => p.eligibility !== "NOT_SUPPORTED");
          if (!hits.length) throw new Error(`No payer found for "${payerName}". Pick the payer from the list.`);
          payerId = hits[0].id || hits[0].stediId; payerName = hits[0].name;
        }
        const reqBody = {
          payerId, provider: { name: { organization: org }, npi },
          subscriber: { memberId, dateOfBirth: dob, name: { person: { firstName: first, lastName: last } } },
          encounter: { services: [{ value: "30", system: "STC" }] },
        };
        const r = await stedi(ELIG_URL, { method: "POST", body: JSON.stringify(reqBody) });
        const resp = await r.json().catch(() => ({}));
        await admin.from("audit_log").insert({ actor: u.user.id, action: "eligibility_check", tbl: "eligibility", row_id: payerId, detail: { payerId, payer: payerName, http: r.status } });
        if (!r.ok && !resp.errors) throw new Error(resp.message || `The clearinghouse answered ${r.status}.`);
        return json({ ok: true, payer: { id: payerId, name: payerName }, response: resp });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
