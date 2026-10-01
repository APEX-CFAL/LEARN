/* Apex service worker — makes repeat opens instant.
   The app shell (Apex_v100.html + this site's own scripts/data) is served from the device's
   cache first and refreshed in the background. When a newer Apex_v100.html is found on the
   server it's cached for the NEXT open, and the page is told so it can offer a Reload now.
   Live data (Firebase, Google sign-in/Calendar, Groq) is never touched — only this site's own
   files and the two static CDNs (fonts, KaTeX). */
const VERSION = 'apex-shell-v1';
const SHELL_KEY = './Apex_v100.html';
const SHELL = [SHELL_KEY, './index.html'];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The shell HTML changed on the server: drop every other cached same-origin file so the next
// load (the one the Reload banner triggers) can't pair the new page with stale modules/data.
async function purgeNonShell(cache) {
  const keys = await cache.keys();
  const keep = SHELL.map((s) => s.replace(/^\./, ''));
  await Promise.all(keys.filter((r) => !keep.some((k) => r.url.endsWith(k))).map((r) => cache.delete(r)));
}

// Compare the server's Apex_v100.html with the cached one (conditional request — a cheap 304
// when nothing changed, bypassing the browser's own HTTP cache so a deploy is seen on the next
// open rather than minutes later). Returns true when a newer version was cached.
let _checking = null;
function checkShellUpdate() {
  if (_checking) return _checking;
  _checking = (async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(SHELL_KEY);
    const res = await fetch(new Request(SHELL_KEY, { cache: 'no-cache' }));
    if (!res || !res.ok) return false;
    if (!cached) { await cache.put(SHELL_KEY, res.clone()); return false; }
    const [a, b] = await Promise.all([cached.clone().text(), res.clone().text()]);
    if (a === b) return false;
    await purgeNonShell(cache);
    await cache.put(SHELL_KEY, res.clone());
    return true;
  })().catch(() => false).finally(() => { _checking = null; });
  return _checking;
}

async function notifyAll(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clients.forEach((c) => c.postMessage(msg));
}

async function serveShell(e) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(SHELL_KEY);
  // Background check; e.waitUntil keeps the worker alive until it finishes.
  const refresh = checkShellUpdate().then((updated) => { if (updated) notifyAll({ type: 'apex-update-available' }); return updated; });
  e.waitUntil(refresh);
  if (cached) return cached;
  await refresh;
  const now = await cache.match(SHELL_KEY);
  return now || new Response('<h1>Apex is offline</h1><p>Connect to the internet once to load the app.</p>', { status: 503, headers: { 'Content-Type': 'text/html' } });
}

async function staleWhileRevalidate(e) {
  const req = e.request;
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  const refresh = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) return cache.put(req, res.clone()).then(() => res);
    return res;
  }).catch(() => null);
  e.waitUntil(refresh);
  if (cached) return cached;
  const res = await refresh;
  return res || Response.error();
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (e) { return Response.error(); }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Opening the app (/, index.html or Apex_v100.html): serve the shell from cache, check the
  // server in the background. Serving the app for "/" directly also skips index.html's redirect hop.
  if (req.mode === 'navigate' && sameOrigin && /(\/|\/index\.html|\/Apex_v100\.html)$/.test(url.pathname)) { e.respondWith(serveShell(e)); return; }

  // This site's own scripts/data (ai-logic modules, apex-data chunks, the notes bundle; sw.js
  // itself excluded): cached after first use, refreshed in the background on later uses.
  if (sameOrigin && !url.pathname.endsWith('/sw.js')) { e.respondWith(staleWhileRevalidate(e)); return; }

  // Versioned static CDN assets (fonts, KaTeX): never change, so cache-first.
  if (CDN_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req)); return; }

  // Everything else (Firebase, Google, Groq): straight to the network, untouched.
});

// The page asks once it's fully loaded (and whenever it comes back into view) — a reply to the
// asking page can't be lost the way a message posted mid-navigation can.
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'apex-check-update') return;
  e.waitUntil(checkShellUpdate().then((updated) => {
    if (updated && e.source) e.source.postMessage({ type: 'apex-update-available' });
  }));
});
