/* Service worker — offline-first com cache versionado.
   Os dados do usuário ficam no IndexedDB e NUNCA são tocados aqui. */
const VERSION = '3.2.0';
const APP_CACHE = 'tlm-app-' + VERSION;   // muda a cada versão
const IMG_CACHE = 'tlm-img-v1';           // fotos: mantidas entre versões
const IMG_MAX = 150;
const ASSETS = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

/* Imagem exibida quando a foto não está no cache e não há internet */
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#172438"/>
<text x="200" y="140" font-family="-apple-system,Arial" font-size="40" text-anchor="middle" fill="#71e7ca">📷</text>
<text x="200" y="185" font-family="-apple-system,Arial" font-size="18" text-anchor="middle" fill="#b3c2d5">Foto indisponível offline</text></svg>`;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(ASSETS)));
  /* Não chama skipWaiting aqui: o app pergunta ao usuário antes de atualizar */
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('tlm-app-') && k !== APP_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

async function trimImages() {
  const c = await caches.open(IMG_CACHE), keys = await c.keys();
  for (let i = 0; i < keys.length - IMG_MAX; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Fotos dos exercícios: cache em runtime, cache-first */
  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith((async () => {
      const c = await caches.open(IMG_CACHE), hit = await c.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimImages(); }
        return res;
      } catch (err) {
        return new Response(FALLBACK_SVG, { headers: { 'Content-Type': 'image/svg+xml' } });
      }
    })());
    return;
  }

  if (url.origin !== location.origin) return;

  /* Navegação: sempre a index.html do cache (funciona em modo avião) */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(APP_CACHE);
      return (await c.match('./index.html')) || (await c.match('./')) || fetch(req);
    })());
    return;
  }

  /* Demais arquivos do app: cache-first, rede como reserva */
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(APP_CACHE)).put(req, res.clone());
      return res;
    } catch (err) { return new Response('', { status: 504 }); }
  })());
});
