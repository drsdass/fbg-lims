// First Bio Genetics portal service worker: keeps the app (not patient data) available offline.
const CACHE = "fbg-shell-v1";
const SHELL = ["/", "/index.html", "/logo.png"];
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;            // never touch Supabase or other APIs
  if (r.mode === "navigate") {                          // pages: network first, cached app when offline
    e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put("/index.html", cp)); return res; }).catch(() => caches.match("/index.html")));
    return;
  }
  if (u.pathname.startsWith("/assets/") || u.pathname === "/logo.png" || u.pathname === "/icd10cm-2026.json") {
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); } return res; })));
  }
});
