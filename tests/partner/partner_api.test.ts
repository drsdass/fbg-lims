// Runs the partner-api Edge Function against an in-memory stand-in for the Supabase client.
//   deno run -A tests/partner/partner_api.test.ts   (prints a transcript compared with tests/golden/partner_api.txt)
Deno.env.set("PARTNER_API_NO_SERVE", "1");
const { handle, sectionsOf } = await import("../../supabase/functions/partner-api/index.ts");

type Row = Record<string, any>;
const db: Record<string, Row[]> = { instrument_devices: [], clinics: [], patients: [], orders: [], partner_log: [], partner_deliveries: [], report_versions: [] };
let seq = 1000;
const get = (r: Row, path: string) => {
  const m = path.split(/->>?/);
  return m.reduce((v: any, k) => (v == null ? undefined : v[k]), r);
};
function q(t: string) {
  const f: ((r: Row) => boolean)[] = [];
  let mode = "select", payload: any = null, opts: any = null, lim = 1e9;
  const run = () => {
    let rows = db[t].filter((r) => f.every((fn) => fn(r)));
    if (mode === "select") return { data: rows.slice(0, lim).map((r) => structuredClone(r)), error: null };
    if (mode === "update") { rows.forEach((r) => Object.assign(r, structuredClone(payload))); return { data: null, error: null }; }
    if (mode === "insert") { db[t].push({ id: crypto.randomUUID(), ...structuredClone(payload) }); return { data: null, error: null }; }
    if (mode === "upsert") {
      const keys = String(opts?.onConflict || "id").split(",");
      const hit = db[t].find((r) => keys.every((k) => r[k] === payload[k]));
      if (hit) Object.assign(hit, structuredClone(payload)); else db[t].push(structuredClone(payload));
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
  const b: any = {
    select() { return b; }, order() { return b; },
    eq(c: string, v: unknown) { f.push((r) => get(r, c) === v); return b; },
    in(c: string, v: unknown[]) { f.push((r) => v.includes(get(r, c))); return b; },
    gte(c: string, v: any) { f.push((r) => (get(r, c) ?? "") >= v); return b; },
    limit(n: number) { lim = n; return b; },
    maybeSingle() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); },
    update(p: any) { mode = "update"; payload = p; return b; },
    insert(p: any) { mode = "insert"; payload = p; return b; },
    upsert(p: any, o: any) { mode = "upsert"; payload = p; opts = o; return b; },
    then(res: any, rej: any) { return Promise.resolve(run()).then(res, rej); },
  };
  return b;
}
const admin = { from: (t: string) => q(t), rpc: (name: string) => Promise.resolve(name === "next_seq_internal" ? { data: ++seq, error: null } : { data: null, error: { message: "no" } }) };
const sha = async (t: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const KEY = "k".repeat(40), BAD = "x".repeat(40);
db.instrument_devices.push({ id: "d1", name: "Peak Panel LIMS", token_hash: await sha(KEY), active: true, scope: "partner", clinic_id: "c2001" });
db.instrument_devices.push({ id: "d2", name: "Lab PC", token_hash: await sha(BAD), active: true, scope: "instrument" });
db.clinics.push({ id: "c2001", data: { id: "c2001", name: "Peak Panel Laboratory", status: "active", providers: [], partner: { enabled: true, map: { "PP-UTI": "UTIABR" },
  catalog: { tests: ["UTIABR", "CMP"], urine: ["Fentanyl", "Oxycodone", "Alprazolam", "Methamphetamine"], oral: ["Fentanyl", "THC (Cannabinoids)"] } } } });
const call = async (body: unknown, key = KEY) => {
  const r = await handle(new Request("https://x/functions/v1/partner-api", { method: "POST", headers: { "x-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body) }), admin);
  return { status: r.status, body: await r.json() };
};
const out = (label: string, v: unknown) => console.log(label, typeof v === "string" ? v : JSON.stringify(v));

out("A1 no key:", (await call({ action: "ping" }, "")).status);
out("A2 instrument key refused:", await call({ action: "ping" }, BAD));
out("A3 ping:", await call({ action: "ping" }));
out("A4 catalog:", (await call({ action: "catalog" })).body.toxicology.definitive);

const order = {
  id: "PP-1001", barcode: "PP1001U", collected_at: new Date(Date.now() - 864e5).toISOString(), collector: "J. Smith", bill_to: "insurance",
  patient: { id: "MRN-77", first_name: "Ana", last_name: "Ruiz", dob: "1985-04-12", sex: "female", phone: "602-555-0101", address: "1 Main St", city: "Mesa", state: "az", zip: "85210",
    insurance: { type: "AHCCCS Complete Care", payer: "Mercy Care", member_id: "A123456" } },
  provider: { name: "Lee Park", credentials: "NP", npi: "1234567893" }, icd10: ["Z79.891", "f11.20"],
  tests: ["PP-UTI"], toxicology: { specimen: "urine", screen: "reflex", definitive: ["fentanyl", "Oxycodone"], prescribed: ["oxycodone", "Percocet"], medications_text: "Percocet 10/325 BID" },
};
const bad = await call({ action: "order.create", order: { ...order, id: "PP-BAD", patient: { first_name: "X" }, provider: { name: "Y", npi: "12" }, icd10: [], tests: ["NOPE"], toxicology: { specimen: "blood" } } });
out("O1 invalid order:", bad);
const ok = await call({ action: "order.create", order });
out("O2 created:", ok);
const o = db.orders[0].data;
out("O3 stored order:", { tests: o.tests, toxSpec: o.toxSpec, screen: o.screen, reflex: o.reflex, confirm: o.confirm, meds: o.meds, rxMeds: o.rxMeds, billType: o.billType, icd: o.icd, vialBarcode: o.vialBarcode, partner: o.partner, source: o.source, status: o.status, confV: o.confV, history: o.history[0].note });
const pt = db.patients[0].data;
out("O4 patient + provider:", { name: `${pt.first} ${pt.last}`, dob: pt.dob, sex: pt.sex, state: pt.state, ins: pt.ins, partnerId: pt.partnerId, clinicId: pt.clinicId, providers: db.clinics[0].data.providers.map((p: any) => `${p.name}, ${p.cred} ${p.npi}`) });
out("O5 same order again:", await call({ action: "order.create", order }));
const second = await call({ action: "order.create", order: { ...order, id: "PP-1002", barcode: "", patient: { ...order.patient, phone: "602-555-0199" }, toxicology: undefined, tests: ["CMP"] } });
out("O6 second order, same patient:", { ok: second.body.ok, patients: db.patients.length, phone: db.patients[0].data.phone, providers: db.clinics[0].data.providers.length, tests: db.orders[1].data.tests });
out("S1 status:", await call({ action: "order.status", id: "PP-1001" }));
out("S2 unknown:", (await call({ action: "order.status", id: "PP-404" })).status);
out("C1 cancel:", await call({ action: "order.cancel", id: "PP-1002", reason: "Duplicate" }));

out("R1 nothing released yet:", await call({ action: "results.pull" }));
// Release PP-1001 with a stored report, reject PP-1002.
Object.assign(o, { status: "Released", releasedAt: Date.now(), reportVersion: 1, history: [...o.history, { s: "Received", at: Date.now() - 3600e3 }] });
db.orders[0].updated_at = new Date().toISOString();
db.report_versions.push({ order_id: o.id, version: 1, data: { status: "FINAL", accession: o.accession, lab: { name: "First Bio Genetics", clia: "03D2287865", director: "Guihua Cao, MD, PhD", address: "1830 S. Alma School Rd, Ste 134, Mesa, AZ 85210", phone: "(480) 847-1916", lines: ["First Bio Genetics"] },
  patient: { name: "Ruiz, Ana", dob: "04/12/1985", age: "41 years", gender: "Female", sex: "F", mrn: pt.mrn }, provider: "Lee Park, NP", npi: "1234567893", clinic: "Peak Panel Laboratory", acct: "FBG-2001", specimen: "Urine",
  collected: "Oct 30, 2026", received: "Oct 30, 2026", reported: "Oct 31, 2026", esign: "Electronically signed by Luna Guerrero", icd: "Z79.891", flags: { ab: 1, crit: 0, inc: 1 },
  blocks: [{ type: "title", text: "Detailed Definitive Results" }, { type: "table", title: "Urine Drug Confirmation, LC-MS/MS", big: true, cols: ["Test Name", "Outcome", "Measured Result", "Cutoff", "Units", "Illicit?", "Status"], widths: [158, 62, 66, 46, 42, 40, 118],
    rows: [{ group: "Opioids Confirmation, Urine" }, { cells: ["Fentanyl", "POSITIVE", "12.4", "<5", "ng/mL", "Yes", "Inconsistent Result"], tone: { 1: "red" } }, { cells: ["Oxycodone", "POSITIVE", "880", "<20", "ng/mL", "No", "Consistent Result for Oxycodone"], tone: {} }] },
    { type: "note", text: "Definitive drug tests by LC-MS/MS were developed by First Bio Genetics." }] } });
const o2 = db.orders[1].data; Object.assign(o2, { status: "Rejected", rejectReason: "Insufficient volume", rejectDetail: "Less than 10 mL", recollectRequested: true }); db.orders[1].updated_at = new Date().toISOString();
const pull = await call({ action: "results.pull", limit: 5 });
const r0 = pull.body.results[0], r1 = pull.body.results[1];
const pdf = r0 && r0.pdf ? atob(r0.pdf.base64) : "";
out("R2 pulled:", { n: pull.body.results.length, more: pull.body.more });
out("R3 report:", { id: r0.id, accession: r0.accession === o.accession, version: r0.version, status: r0.status, patient_id: r0.patient_id, lab: r0.performing_lab, sections: r0.sections, notes: r0.notes, flags: r0.flags, signed: r0.signed,
  pdf: { filename: r0.pdf.filename === `${o.accession}.pdf`, isPdf: pdf.startsWith("%PDF"), kb: pdf.length > 2000 } });
out("R4 rejected:", { id: r1.id, status: r1.status, version: r1.version, reason: r1.rejected_reason, recollect: r1.recollect });
out("R5 delivered, not acked:", db.partner_deliveries.map((d) => ({ v: d.version, tries: d.attempts, acked: !!d.acked_at })));
out("R6 pulled again before ack:", (await call({ action: "results.pull" })).body.results.map((x: any) => x.id));
out("K1 ack:", await call({ action: "results.ack", accession: o.accession, version: 1 }));
out("K2 ack rejected:", await call({ action: "results.ack", accession: o2.accession, version: 0 }));
out("K3 nothing left:", (await call({ action: "results.pull" })).body.results.length);
// A corrected report goes out again as version 2.
Object.assign(o, { reportVersion: 2, corrections: [{}] }); db.report_versions.push({ order_id: o.id, version: 2, data: { ...db.report_versions[0].data, status: "CORRECTED" } });
const corr = await call({ action: "results.pull" });
out("K4 corrected report:", corr.body.results.map((x: any) => ({ id: x.id, version: x.version, status: x.status, file: x.pdf.filename === `${o.accession}-v2.pdf` })));
out("L1 log:", db.partner_log.map((l) => `${l.kind}${l.ok ? "" : " (refused)"}${l.partner_order_id ? " " + l.partner_order_id : ""}`).join(" | "));
out("X1 sections helper:", sectionsOf({ blocks: [{ type: "lines", lines: [["Corrected report", "Replaces the earlier report"]] }] }));
db.clinics[0].data.partner.enabled = false;
out("X2 interface off:", await call({ action: "ping" }));
