/* Service worker - Jadwal Fantastic 4
 * - Halaman & aset: network-first (update langsung muncul), cadangan dari cache saat offline
 * - Data spreadsheet (CSV): network-first, cadangan data terakhir saat offline
 * Naikkan nomor VERSION jika ingin memaksa semua perangkat membuang cache lama.
 */
const VERSION = 'v1';
const CACHE = 'jadwal-f4-' + VERSION;
const SCOPE = self.registration.scope;
const SHELL_URL = new URL('index.html', SCOPE).href;
const PRECACHE = [
  './',
  'index.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
].map(p => new URL(p, SCOPE).href);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('jadwal-f4-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isSheetCsv(url) {
  return url.hostname === 'docs.google.com' && url.pathname.indexOf('/spreadsheets/') === 0;
}

// Kunci cache untuk CSV: buang parameter "v" (cache-buster) agar semua request berbagi satu entri
function csvKey(url) {
  const u = new URL(url.href);
  u.searchParams.delete('v');
  return u.href;
}

async function sheetNetworkFirst(request, url) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(csvKey(url), res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(csvKey(url));
    if (!cached) throw err;
    const headers = new Headers(cached.headers);
    headers.set('X-From-Cache', '1');
    return new Response(await cached.blob(), { status: 200, headers });
  }
}

async function pageNetworkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(SHELL_URL, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(SHELL_URL)) || Response.error();
  }
}

async function assetNetworkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isSheetCsv(url)) {
    event.respondWith(sheetNetworkFirst(req, url));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(pageNetworkFirst(req));
    return;
  }
  event.respondWith(assetNetworkFirst(req));
});
