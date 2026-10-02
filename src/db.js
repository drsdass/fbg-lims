// Data layer: Supabase auth (with two-step verification), loading and saving.
// Every table row is { id, data (the record as JSON), ... }. Row Level Security
// in the database decides what each signed-in user can read and write.
import { createClient } from "@supabase/supabase-js";

const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").replace(/\s+/g, "");
// A key copied from the dashboard's shortened display contains "…", which browsers refuse to send.
export const CONFIG_ERROR = !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)
  ? "The Supabase URL isn't set correctly. Check VITE_SUPABASE_URL in your host's environment variables, then redeploy."
  : !/^[\x21-\x7e]+$/.test(key) || key.length < 20
  ? "The Supabase key isn't set correctly. Copy the publishable key with the copy button and paste it into VITE_SUPABASE_ANON_KEY, then redeploy."
  : "";
if (CONFIG_ERROR) console.error(CONFIG_ERROR);
export const sb = createClient(CONFIG_ERROR ? "https://invalid.supabase.co" : url, CONFIG_ERROR ? "invalid-key-placeholder" : key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

const DOC_TABLES = ["clinics", "patients", "orders", "notes", "claims", "outbox", "supply_orders", "pickups", "invoices"];
const LAB_ONLY = new Set(["claims", "outbox"]);
const SETTINGS = ["lab", "fees", "confMap", "therapy"];
const PENDING_KEY = "fbg-pending-registration";

let synced = {};           // "table:id" -> JSON last known to be on the server
// Sign-in loads open work plus the last WINDOW_DAYS; older records are fetched on demand.
export const WINDOW_DAYS = 90;
const WINDOWED = new Set(["patients", "orders", "notes", "claims", "outbox", "supply_orders", "pickups", "invoices"]);
let lastSync = {};         // table -> server timestamp of the newest change seen
let scaleOk = true;        // false until 0011_scale.sql has been run
const rpcMissing = (e) => e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|function .* does not exist/i.test(e.message || ""));
async function fetchRpc(fn, args) {
  const out = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.rpc(fn, args).range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}
// Records in the window can point at older ones (a claim on hold for months, an unpaid invoice).
// Fetch those referenced orders and patients so nothing on screen points at a missing record.
async function fillRefs(res) {
  if (!scaleOk) return;
  const have = new Set((res.orders || []).map(o => o.id)), need = new Set();
  [...(res.claims || []), ...(res.outbox || []), ...(res.notes || [])].forEach(x => { if (x && x.orderId && !have.has(x.orderId)) need.add(x.orderId); });
  (res.invoices || []).forEach(i => (i.lines || []).forEach(l => { if (l.orderId && !have.has(l.orderId)) need.add(l.orderId); }));
  if (need.size) { const r = await sb.rpc("orders_by_ids", { p_ids: [...need] }); if (!r.error) res.orders = [...(res.orders || []), ...(r.data || []).map(x => x.data)]; }
  const haveP = new Set((res.patients || []).map(p => p.id)), needP = new Set();
  [...(res.orders || []), ...(res.claims || [])].forEach(x => { if (x && x.patientId && !haveP.has(x.patientId)) needP.add(x.patientId); });
  if (needP.size) { const r = await sb.rpc("patients_by_ids", { p_ids: [...needP] }); if (!r.error) res.patients = [...(res.patients || []), ...(r.data || []).map(x => x.data)]; }
}
const newest = (rows, prev) => rows.reduce((m, r) => (r.updated_at && r.updated_at > m ? r.updated_at : m), prev || "");
// Merge server rows into S without overwriting local edits that haven't saved yet.
function mergeRows(S, t, rows) {
  const list = S[t] = S[t] || [], idx = new Map(list.map((d, i) => [d.id, i]));
  for (const r of rows) {
    const d = r.data, k = t + ":" + d.id, i = idx.get(d.id);
    if (i !== undefined) { const mine = list[i]; if (synced[k] !== undefined && synced[k] !== JSON.stringify(mine)) continue; list[i] = d; }
    else { idx.set(d.id, list.length); list.push(d); }
    synced[k] = JSON.stringify(d);
  }
  return rows.length;
}
let canSettings = false, saveTimer = null, saving = false, again = false, onError = () => {};

const missingTable = (e) => e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(e.message || ""));
async function fetchAll(table, cols) {
  const out = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + page - 1);
    // A table added by a newer migration may not exist yet; treat it as empty until the SQL is run.
    if (error && missingTable(error)) return out;
    if (error) throw error;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

function dirty(S, isLab) {
  const out = [];
  for (const t of DOC_TABLES) {
    if (LAB_ONLY.has(t) && !isLab) continue;
    for (const d of S[t] || []) {
      const k = t + ":" + d.id, j = JSON.stringify(d);
      if (synced[k] !== j) out.push({ t, d, k, j });
    }
  }
  if (isLab && canSettings) for (const key of SETTINGS) {
    if (S[key] === undefined) continue;
    const k = "settings:" + key, j = JSON.stringify(S[key]);
    if (synced[k] !== j) out.push({ t: "settings", key, d: S[key], k, j });
  }
  return out;
}

async function flush(S, isLab) {
  if (saving) { again = true; return; }
  saving = true;
  try {
    const items = dirty(S, isLab);
    const byTable = {};
    for (const it of items) (byTable[it.t] = byTable[it.t] || []).push(it);
    for (const [t, list] of Object.entries(byTable)) {
      const toRow = it => t === "settings" ? { key: it.key, data: it.d }
        : t === "notes" ? { id: it.d.id, aud: it.d.aud, data: it.d }
        : (t === "patients" || t === "orders" || t === "supply_orders" || t === "pickups" || t === "invoices") ? { id: it.d.id, clinic_id: it.d.clinicId, data: it.d }
        : { id: it.d.id, data: it.d };
      if (t === "settings") {
        const { error } = await sb.from(t).upsert(list.map(toRow));
        if (error) onError(error); else list.forEach(it => { synced[it.k] = it.j; });
        continue;
      }
      // New records are inserted; existing ones are updated one by one, so the
      // database's insert and update rules each apply exactly where they should.
      const fresh = list.filter(it => synced[it.k] === undefined), existing = list.filter(it => synced[it.k] !== undefined);
      if (fresh.length) {
        const { error } = await sb.from(t).insert(fresh.map(toRow));
        if (error) onError(error); else fresh.forEach(it => { synced[it.k] = it.j; });
      }
      for (const it of existing) {
        const { error } = await sb.from(t).update({ data: it.d }).eq("id", it.d.id);
        if (error) onError(error); else synced[it.k] = it.j;
      }
    }
  } catch (e) { onError(e); }
  finally {
    saving = false;
    if (again) { again = false; flush(S, isLab); }
  }
}

export const DB = {
  onSaveError(fn) { onError = fn; },
  setSettingsWritable(b) { canSettings = !!b; },
  async manageUsers(action, payload) {
    const { data, error } = await sb.functions.invoke("manage-users", { body: { action, ...(payload || {}) } });
    if (error) {
      let msg = error.message || "Couldn't reach the user service.";
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  },
  async createClinic(clinic) { const { data, error } = await sb.rpc("create_clinic", { p_clinic: clinic }); if (error) throw error; return data; },
  async passwordChanged() { const { error } = await sb.rpc("password_changed"); if (error) throw error; },
  onAuth(fn) { sb.auth.onAuthStateChange((event, session) => fn(event, session)); },
  async session() { const { data } = await sb.auth.getSession(); return data.session; },
  async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; },
  async signOut() { synced = {}; await sb.auth.signOut(); },
  async resetPassword(email) { await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin }); },
  async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw error; },

  // Two-step verification (TOTP authenticator app)
  async mfaRequired() { const { data, error } = await sb.rpc("mfa_required"); if (error) return true; return data !== false; },
  async aal() { const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); if (error) throw error; return data; },
  async mfaSetup() {
    const { data, error } = await sb.auth.mfa.listFactors(); if (error) throw error;
    const verified = (data.totp || []).filter(f => f.status === "verified");
    if (verified.length) return { mode: "verify", factorId: verified[0].id };
    for (const f of (data.all || []).filter(f => f.status !== "verified")) await sb.auth.mfa.unenroll({ factorId: f.id });
    const en = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "FBG portal" });
    if (en.error) throw en.error;
    return { mode: "enroll", factorId: en.data.id, qr: en.data.totp.qr_code, secret: en.data.totp.secret };
  },
  async mfaVerify(factorId, code) {
    const ch = await sb.auth.mfa.challenge({ factorId }); if (ch.error) throw ch.error;
    const { error } = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code }); if (error) throw error;
  },

  async profile() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { user: null, profile: null };
    const { data, error } = await sb.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return { user, profile: data };
  },

  // Clinic self-registration. With email confirmation on, the clinic is created
  // on the first sign-in after the user confirms their email.
  async registerClinic(email, password, name, clinic) {
    const slim = { ...clinic, agreement: { ...clinic.agreement, sig: null } };
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ email: email.toLowerCase(), name, clinic })); } catch (e) {}
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name, pending_clinic: slim }, emailRedirectTo: location.origin } });
    if (error) throw error;
    if (data.session) { await DB.finishRegistration(data.user); return "done"; }
    return "confirm";
  },
  async finishRegistration(user) {
    let pending = null;
    try { const p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); if (p && p.email === (user.email || "").toLowerCase()) pending = p; } catch (e) {}
    const clinic = pending ? pending.clinic : user.user_metadata && user.user_metadata.pending_clinic;
    const name = pending ? pending.name : (user.user_metadata && user.user_metadata.name) || "";
    if (!clinic) return false;
    const { error } = await sb.rpc("register_clinic", { p_clinic: clinic, p_name: name });
    if (error) throw error;
    try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
    return true;
  },

  async loadAll(isLab) {
    const tables = isLab ? DOC_TABLES : DOC_TABLES.filter(t => !LAB_ONLY.has(t));
    const res = {};
    let now = new Date().toISOString();
    try { const { data, error } = await sb.rpc("server_now"); if (error) { if (rpcMissing(error)) scaleOk = false; else throw error; } else if (data) now = data; } catch (e) { scaleOk = false; }
    lastSync = {};
    await Promise.all(tables.map(async t => {
      let rows;
      if (scaleOk && WINDOWED.has(t)) {
        try { rows = await fetchRpc("doc_window", { p_table: t, p_days: WINDOW_DAYS }); }
        catch (e) { if (!rpcMissing(e)) throw e; scaleOk = false; }
      }
      if (!rows) rows = await fetchAll(t, "id,data,updated_at");
      res[t] = rows.map(r => r.data);
      lastSync[t] = newest(rows, now) > now ? newest(rows, now) : now;
    }));
    await fillRefs(res);
    const set = await fetchAll("settings", "key,data");
    for (const r of set) res[r.key] = r.data;
    if (!isLab) { res.claims = []; res.outbox = []; }
    return res;
  },
  markSynced(S, isLab) {
    synced = {};
    for (const t of DOC_TABLES) for (const d of S[t] || []) synced[t + ":" + d.id] = JSON.stringify(d);
    if (isLab) for (const k of SETTINGS) if (S[k] !== undefined) synced["settings:" + k] = JSON.stringify(S[k]);
  },
  // Merge fresh server data into S, keeping local edits that haven't saved yet.
  merge(S, fresh, isLab) {
    const tables = isLab ? DOC_TABLES : DOC_TABLES.filter(t => !LAB_ONLY.has(t));
    for (const t of tables) {
      const local = new Map((S[t] || []).map(d => [d.id, d]));
      const next = [];
      for (const d of fresh[t] || []) {
        const k = t + ":" + d.id, mine = local.get(d.id);
        if (mine && synced[k] !== JSON.stringify(mine)) next.push(mine);
        else { next.push(d); synced[k] = JSON.stringify(d); }
        local.delete(d.id);
      }
      for (const [id, d] of local) if (synced[t + ":" + id] !== JSON.stringify(d)) next.push(d);
      S[t] = next;
    }
    if (!isLab && fresh.lab) S.lab = fresh.lab;
  },
  scaled() { return scaleOk; },
  // Every 30 seconds: fetch only what changed. Returns false if the server can't do that yet.
  async loadChanges(S, isLab) {
    if (!scaleOk) return false;
    const tables = isLab ? DOC_TABLES : DOC_TABLES.filter(t => !LAB_ONLY.has(t));
    for (const t of tables) {
      const since = new Date(new Date(lastSync[t] || 0).getTime() - 5000).toISOString();
      const { data, error } = await sb.rpc("changes_since", { p_table: t, p_since: since });
      if (error) { if (rpcMissing(error)) { scaleOk = false; return false; } throw error; }
      if (data && data.length) { mergeRows(S, t, data); lastSync[t] = newest(data, lastSync[t]); }
    }
    const refs = { orders: S.orders, patients: S.patients, claims: S.claims, outbox: S.outbox, notes: S.notes, invoices: S.invoices };
    const before = { o: (S.orders || []).length, p: (S.patients || []).length };
    await fillRefs(refs);
    if (refs.orders.length > before.o) mergeRows(S, "orders", refs.orders.slice(before.o).map(d => ({ data: d })));
    if (refs.patients.length > before.p) mergeRows(S, "patients", refs.patients.slice(before.p).map(d => ({ data: d })));
    const set = await fetchAll("settings", "key,data");
    for (const r of set) { const k = "settings:" + r.key; if (synced[k] === undefined || synced[k] === JSON.stringify(S[r.key])) { S[r.key] = r.data; synced[k] = JSON.stringify(r.data); } }
    return true;
  },
  // ---------- on-demand lookups (older records) ----------
  async search(S, q) {
    if (!scaleOk || String(q).trim().length < 3) return 0;
    const [o, p] = await Promise.all([sb.rpc("search_orders", { p_q: q }), sb.rpc("search_patients", { p_q: q })]);
    if (o.error || p.error) return 0;
    const ids = [...new Set((o.data || []).map(r => r.data.patientId))].filter(id => !(S.patients || []).some(x => x.id === id));
    if (ids.length) { const r = await sb.rpc("patients_by_ids", { p_ids: ids }); if (!r.error) mergeRows(S, "patients", r.data || []); }
    return mergeRows(S, "patients", p.data || []) + mergeRows(S, "orders", o.data || []);
  },
  async patientOrders(S, pid) {
    if (!scaleOk) return 0;
    const { data, error } = await sb.rpc("patient_orders", { p_patient: pid });
    if (error) return 0;
    if (!(S.patients || []).some(x => x.id === pid)) { const r = await sb.rpc("patients_by_ids", { p_ids: [pid] }); if (!r.error) mergeRows(S, "patients", r.data || []); }
    return mergeRows(S, "orders", data || []);
  },
  async ordersByIds(S, ids) {
    if (!scaleOk || !ids.length) return 0;
    const { data, error } = await sb.rpc("orders_by_ids", { p_ids: ids }); if (error) return 0;
    const pids = [...new Set((data || []).map(r => r.data.patientId))].filter(id => !(S.patients || []).some(x => x.id === id));
    if (pids.length) { const r = await sb.rpc("patients_by_ids", { p_ids: pids }); if (!r.error) mergeRows(S, "patients", r.data || []); }
    return mergeRows(S, "orders", data || []);
  },
  async patientsByIds(S, ids) { if (!scaleOk || !ids.length) return 0; const { data, error } = await sb.rpc("patients_by_ids", { p_ids: ids }); if (error) return 0; return mergeRows(S, "patients", data || []); },
  async olderOrders(S, before, limit) {
    if (!scaleOk) return 0;
    const { data, error } = await sb.rpc("orders_before", { p_before: Math.floor(before), p_limit: limit || 200 }); if (error) return 0;
    const pids = [...new Set((data || []).map(r => r.data.patientId))].filter(id => !(S.patients || []).some(x => x.id === id));
    if (pids.length) { const r = await sb.rpc("patients_by_ids", { p_ids: pids }); if (!r.error) mergeRows(S, "patients", r.data || []); }
    return mergeRows(S, "orders", data || []);
  },
  async clientBillOrders(S, from, to) { if (!scaleOk) return 0; const { data, error } = await sb.rpc("client_bill_orders", { p_from: Math.floor(from), p_to: Math.floor(to) }); if (error) return 0; return mergeRows(S, "orders", data || []); },
  async orderFacts(fromMs, clinic) { if (!scaleOk) return null; try { return await fetchRpc("order_facts", { p_from: Math.floor(fromMs), p_clinic: clinic || null }); } catch (e) { if (rpcMissing(e)) { scaleOk = false; return null; } throw e; } },
  async claimsSince(fromMs) { if (!scaleOk) return null; try { return (await fetchRpc("claims_since", { p_from: Math.floor(fromMs) })).map(r => r.data); } catch (e) { return null; } },
  async patientFacts() { if (!scaleOk) return null; try { return await fetchRpc("patient_facts", {}); } catch (e) { return null; } },
  async ordersMissingSummary(S, limit) { const { data, error } = await sb.rpc("orders_missing_summary", { p_limit: limit || 100 }); if (error) throw error; mergeRows(S, "orders", data || []); return (data || []).map(r => r.data.id); },
  async allRows(t) { return (await fetchAll(t, "id,data")).map(r => r.data); },
  queueSave(S, isLab) { clearTimeout(saveTimer); saveTimer = setTimeout(() => flush(S, isLab), 350); },
  flushNow(S, isLab) { clearTimeout(saveTimer); return flush(S, isLab); },
  hasUnsaved(S, isLab) { return dirty(S, isLab).length > 0; },

  async alertStatus() { const { data, error } = await sb.functions.invoke("send-alerts", { body: { action: "status" } }); if (error) throw error; return data; },
  async alertTest(channel, dest) {
    const { data, error } = await sb.functions.invoke("send-alerts", { body: { action: "test", channel, dest } });
    if (error) { let msg = error.message; try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {} throw new Error(msg); }
    if (data && data.ok === false) throw new Error(data.error || "The test failed.");
    return data;
  },
  // ---------- instrument inbox and bridge devices ----------
  functionUrl(name) { return `${url.replace(/\/+$/, "")}/functions/v1/${name}`; },
  async inboxList() {
    const { data, error } = await sb.from("instrument_inbox").select("id,instrument,file_name,size,received_at,status").eq("status", "new").order("received_at", { ascending: true }).limit(200);
    if (error) { if (missingTable(error)) return []; throw error; }
    return data;
  },
  async inboxContent(id) { const { data, error } = await sb.from("instrument_inbox").select("content,file_name,instrument").eq("id", id).single(); if (error) throw error; return data; },
  async inboxMark(id, status, note) {
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("instrument_inbox").update({ status, note: note || null, handled_at: new Date().toISOString(), handled_by: user && user.id }).eq("id", id);
    if (error) throw error;
  },
  async devicesList() {
    let { data, error } = await sb.from("instrument_devices").select("id,name,active,created_at,last_seen,scope").order("created_at");
    if (error && /scope/i.test(error.message || "")) ({ data, error } = await sb.from("instrument_devices").select("id,name,active,created_at,last_seen").order("created_at"));
    if (error) { if (missingTable(error)) return []; throw error; } return data;
  },
  async deviceAdd(name, tokenHash, scope) { const row = { name, token_hash: tokenHash }; if (scope && scope !== "instrument") row.scope = scope; const { error } = await sb.from("instrument_devices").insert(row); if (error) { if (scope && /scope/i.test(error.message || "")) throw new Error("Run supabase/migrations/0012_referrals.sql first."); throw error; } },

  async clinicUsage(id) { const { data, error } = await sb.rpc("clinic_usage", { p_clinic: id }); if (error) { if (/clinic_usage/.test(error.message || "")) throw new Error("Run supabase/migrations/0013_clinic_archive.sql first."); throw error; } return data; },
  async clinicDelete(id) { const { data, error } = await sb.from("clinics").delete().eq("id", id).select("id"); if (error) throw error; if (!data || !data.length) throw new Error("The clinic couldn't be deleted. Check it has no patients, orders or users, and that migration 0013 is installed."); },

  // ---------- Amico DX electronic referrals ----------
  async referralsQueue(rows) {
    const { error } = await sb.from("referrals").insert(rows);
    if (error) { if (missingTable(error)) { const e = new Error("Referral queue isn't set up: run supabase/migrations/0012_referrals.sql."); e.missing = true; throw e; } throw error; }
  },
  async referralsFor(orderIds) {
    if (!orderIds.length) return [];
    const { data, error } = await sb.from("referrals").select("id,order_id,accession,manifest,status,created_at,delivered_at,acked_at,note,attempts").in("order_id", orderIds);
    if (error) { if (missingTable(error)) return null; throw error; }
    return data || [];
  },
  async referralMessages(ids) { const { data, error } = await sb.from("referrals").select("id,accession,message").in("id", ids); if (error) throw error; return data || []; },
  async referralSet(id, status, note) { const { error } = await sb.from("referrals").update({ status, note: note || null }).eq("id", id); if (error) throw error; },
  async referralNotify(body) { const { data, error } = await sb.functions.invoke("send-alerts", { body: { action: "referral", ...body } }); if (error) throw error; return data; },
  async deviceSetActive(id, active) { const { error } = await sb.from("instrument_devices").update({ active }).eq("id", id); if (error) throw error; },
  // ---------- patient portal ----------
  async patientReports() { const { data, error } = await sb.from("report_versions").select("id,order_id,version,data,released_at"); if (error) throw error; return data; },
  async publicLab() { const { data } = await sb.from("settings").select("data").eq("key", "lab").maybeSingle(); return data && data.data ? { name: data.data.name, phone: data.data.phone, address: data.data.address, clia: data.data.clia } : null; },
  async patientAccess(body) {
    const { data, error } = await sb.functions.invoke("patient-access", { body });
    if (error) { let msg = error.message; try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {} throw new Error(msg); }
    if (data && data.error) throw new Error(data.error);
    return data;
  },
  // ---------- locked report versions ----------
  async reportVersions(orderId) {
    const { data, error } = await sb.from("report_versions").select("id,version,data,released_at").eq("order_id", orderId).order("version", { ascending: true });
    if (error) { if (missingTable(error)) return null; throw error; }
    return data;
  },
  async saveReportVersion(orderId, version, model) {
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("report_versions").insert({ id: `${orderId}-v${version}`, order_id: orderId, version, data: model, released_by: user && user.id });
    if (error && !missingTable(error)) throw error;
  },
  // ---------- compliance records ----------
  async qmsAll() { const rows = await fetchAll("qms_records", "id,kind,ref,data"); return rows.map((r) => ({ ...r.data, id: r.id, kind: r.kind, ref: r.ref })); },
  async qmsSave(rec) {
    const at = rec.at ? new Date(rec.at).toISOString() : new Date().toISOString();
    const { error } = await sb.from("qms_records").upsert({ id: rec.id, kind: rec.kind, ref: rec.ref || null, at, data: rec });
    if (error) throw error;
  },
  async qmsUpload(file) {
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const { error } = await sb.storage.from("qms-docs").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (error) throw error;
    return { path, name: file.name };
  },
  async qmsFileUrl(path) { const { data, error } = await sb.storage.from("qms-docs").createSignedUrl(path, 300); if (error) throw error; return data.signedUrl; },
  // ---------- quality control ----------
  async qcMaterials() { return (await fetchAll("qc_materials", "id,data")).map((r) => r.data); },
  async qcResultsSince(sinceMs, materialId) {
    const out = [], page = 1000;
    for (let from = 0; ; from += page) {
      let q = sb.from("qc_results").select("id,data").gte("at", new Date(sinceMs).toISOString()).order("at", { ascending: true });
      if (materialId) q = q.eq("material_id", materialId);
      const { data, error } = await q.range(from, from + page - 1);
      if (error) { if (missingTable(error)) return out; throw error; }
      out.push(...data.map((r) => r.data));
      if (data.length < page) break;
    }
    return out;
  },
  async qcInsertMaterials(list) { if (!list.length) return; const { error } = await sb.from("qc_materials").upsert(list.map((m) => ({ id: m.id, data: m })), { onConflict: "id", ignoreDuplicates: true }); if (error) throw error; },
  async qcSaveMaterial(m) { const { error } = await sb.from("qc_materials").upsert({ id: m.id, data: m }); if (error) throw error; },
  async qcAddResults(list) {
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await sb.from("qc_results").upsert(list.slice(i, i + 500).map((r) => ({ id: r.id, material_id: r.materialId, at: new Date(r.at).toISOString(), data: r })), { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    }
  },
  async qcUpdateResult(r) { const { error } = await sb.from("qc_results").update({ data: r }).eq("id", r.id); if (error) throw error; },
  async sendAlerts() {
    const { data, error } = await sb.functions.invoke("send-alerts", { body: {} });
    if (error) {
      let msg = error.message || "Couldn't reach the alert service.";
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    return data;
  },
  async nextSeq(name) { const { data, error } = await sb.rpc("next_seq", { p_name: name }); if (error) throw error; return Number(data); },
  log(action, table, id, detail) { sb.from("audit_log").insert({ action, tbl: table, row_id: id == null ? null : String(id), detail: detail || null }).then(() => {}, () => {}); },
  logView(table, id, detail) { DB.log("view", table, id, detail ? { what: detail } : null); },
  async audit({ from, to, actor, action, rowIds, offset = 0, limit = 200 }) {
    let q = sb.from("audit_log").select("id,at,actor,action,tbl,row_id,detail").order("at", { ascending: false });
    if (from) q = q.gte("at", new Date(from + "T00:00:00").toISOString());
    if (to) q = q.lte("at", new Date(to + "T23:59:59.999").toISOString());
    if (actor) q = q.eq("actor", actor);
    if (action) q = q.in("action", action.split(","));
    if (rowIds) q = q.in("row_id", rowIds.slice(0, 300));
    const { data, error } = await q.range(offset, offset + limit - 1);
    if (error) throw error;
    return data;
  },
  async profilesAll() { return fetchAll("profiles", "user_id,role,clinic_id,name,email"); },
};
