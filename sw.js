const CACHE_NAME = 'diretas-v2';
const CACHE_ESTATICO = ['css/diretas.css', 'js/diretas.js', 'icons/icon-192.png', 'icons/icon-512.png', 'manifest.json'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CACHE_ESTATICO)).catch(() => {}));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
    );
    self.clients.claim();
});

// Rede primeiro (conteúdo sempre atualizado); cache só como reserva offline.
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== location.origin) return;
    event.respondWith(
        fetch(req).then((resp) => {
            if (resp.ok && !url.pathname.endsWith('.php')) {
                const copia = resp.clone();
                caches.open(CACHE_NAME).then((c) => c.put(req, copia));
            }
            return resp;
        }).catch(() => caches.match(req))
    );
});
