const CACHE_NAME = 'doclisten-shell-v4';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/src/styles.css',
  '/manifest.webmanifest',
  '/assets/icon.svg',
  '/contact.html',
  '/privacy.html',
  '/terms.html',
  '/file-policy.html',
  '/beta-launch.html',
  '/blog.html',
  '/pdf-tts-guide.html',
  '/listen-to-pdf-commute.html',
  '/research-paper-audio.html',
  '/pdf-audio-app-comparison.html',
  '/scanned-pdf-limitations.html',
  '/pdf-listening-checklist.html',
  '/accessibility.html',
  '/editorial-policy.html',
  '/audio-reading-vs-summary.html',
  '/pdf-tts-faq.html',
  '/pdf-audio-privacy.html',
  '/ebook-pdf-audio.html',
  '/work-document-audio.html',
  '/study-with-pdf-audio.html',
  '/site-map.html',
  '/about.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))),
  );
});
