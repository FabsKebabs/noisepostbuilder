const CACHE = 'postbuilder-v1';
const ASSETS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './brands.json',
    './favicon.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    // Network first for brands.json so updates always come through
    if (e.request.url.includes('brands.json')) {
        e.respondWith(
            fetch(e.request).then(r => {
                const clone = r.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
                return r;
            }).catch(() => caches.match(e.request))
        );
        return;
    }
    // Cache first for everything else
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request))
    );
});
