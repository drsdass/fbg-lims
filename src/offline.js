// Offline order entry for mobile collectors.
// Opt-in per device. Reference data (clinics, settings) is stored as-is; anything entered offline
// (patients, orders, notes) is encrypted with AES-GCM using a non-extractable key kept in IndexedDB,
// and is deleted once it has uploaded.
const DBN = "fbg-offline", STORE = "kv", ENABLE_KEY = "fbg-offline-device";

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function get(k) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(STORE).objectStore(STORE).get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
async function put(k, v) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(STORE, "readwrite").objectStore(STORE).put(v, k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }
async function del(k) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(STORE, "readwrite").objectStore(STORE).delete(k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }

async function cryptoKey() {
  let k = await get("key");
  if (!k) { k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); await put("key", k); }
  return k;
}
async function seal(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), new TextEncoder().encode(JSON.stringify(obj)));
  return { iv: Array.from(iv), ct: new Uint8Array(ct) };
}
async function open(box) {
  if (!box) return null;
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(box.iv) }, await cryptoKey(), box.ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

export const Offline = {
  supported() { return typeof indexedDB !== "undefined" && !!(crypto && crypto.subtle); },
  deviceEnabled() { try { return localStorage.getItem(ENABLE_KEY) === "1"; } catch (e) { return false; } },
  async setDeviceEnabled(on) { try { on ? localStorage.setItem(ENABLE_KEY, "1") : localStorage.removeItem(ENABLE_KEY); } catch (e) {} if (!on) { await del("ref"); await del("seq"); } },
  // Reference data: no patient information.
  async saveRef(ref) { await put("ref", { ...ref, savedAt: Date.now() }); },
  async loadRef() { return (await get("ref")) || null; },
  // Accession numbers reserved while online, for use offline.
  async seqs() { return (await get("seq")) || []; },
  async addSeqs(list) { const cur = await this.seqs(); await put("seq", [...cur, ...list]); },
  async takeSeq() { const cur = await this.seqs(); const n = cur.shift(); await put("seq", cur); return n; },
  // Records entered offline (encrypted).
  async saveQueue(userId, q) { await put("queue:" + userId, await seal(q)); },
  async loadQueue(userId) { try { return await open(await get("queue:" + userId)); } catch (e) { return null; } },
  async clearQueue(userId) { await del("queue:" + userId); },
  // A Supabase session saved in this browser (the user signed in here and hasn't signed out).
  hasStoredSession() { try { return Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)); } catch (e) { return false; } },
  clearStoredSession() { try { Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) {} },
};
