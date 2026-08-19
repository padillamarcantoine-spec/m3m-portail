// Service worker M3M — PWA installable.
// Philosophie PRUDENTE : le réseau d'abord, toujours. Le cache ne sert que de
// repli hors-ligne. Jamais de cache sur /api (données réelles : factures, comptes).
// → aucun risque de montrer une vieille version de l'app ou des données périmées.
const CACHE = 'm3m-repli-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // On ne touche qu'aux GET de NOTRE domaine, et jamais à l'API ni à l'admin.
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) return;

  e.respondWith((async () => {
    try {
      const reponse = await fetch(e.request);
      // Copie de secours des ressources saines (pages + assets) pour le mode hors-ligne.
      if (reponse.ok && (reponse.type === 'basic' || reponse.type === 'default')) {
        const cache = await caches.open(CACHE);
        cache.put(e.request, reponse.clone());
      }
      return reponse;
    } catch (err) {
      // Hors-ligne : ressource en cache si on l'a, sinon la coquille de l'app.
      const enCache = await caches.match(e.request);
      if (enCache) return enCache;
      if (e.request.mode === 'navigate') {
        const coquille = await caches.match('/');
        if (coquille) return coquille;
      }
      throw err;
    }
  })());
});
