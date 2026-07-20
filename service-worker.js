const CACHE_NAME = 'doclisten-shell-v16';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/src/styles.css',
  '/manifest.webmanifest',
  '/assets/icon.svg',
  '/assets/demo/doclisten-review-sample.pdf',
  '/assets/vendor/pdfjs/VERSION',
  '/assets/vendor/pdfjs/pdf.min.mjs',
  '/assets/vendor/pdfjs/pdf.worker.min.mjs',
  '/assets/vendor/pdfjs/standard_fonts/FoxitDingbats.pfb',
  '/assets/vendor/pdfjs/standard_fonts/FoxitFixed.pfb',
  '/assets/vendor/pdfjs/standard_fonts/FoxitFixedBold.pfb',
  '/assets/vendor/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb',
  '/assets/vendor/pdfjs/standard_fonts/FoxitFixedItalic.pfb',
  '/assets/vendor/pdfjs/standard_fonts/FoxitSerif.pfb',
  '/assets/vendor/pdfjs/standard_fonts/FoxitSerifBold.pfb',
  '/assets/vendor/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb',
  '/assets/vendor/pdfjs/standard_fonts/FoxitSerifItalic.pfb',
  '/assets/vendor/pdfjs/standard_fonts/FoxitSymbol.pfb',
  '/assets/vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf',
  '/assets/vendor/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf',
  '/assets/vendor/pdfjs/standard_fonts/LiberationSans-Italic.ttf',
  '/assets/vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
  '/assets/guides/doclisten-home.png',
  '/assets/guides/doclisten-pdf-loaded.png',
  '/assets/guides/doclisten-listening.png',
  '/contact.html',
  '/delete-account.html',
  '/privacy.html',
  '/terms.html',
  '/file-policy.html',
  '/acceptable-use.html',
  '/beta-launch.html',
  '/blog.html',
  '/doclisten-field-test.html',
  '/pdf-tts-guide.html',
  '/listen-to-pdf-commute.html',
  '/research-paper-audio.html',
  '/scanned-pdf-limitations.html',
  '/ebook-pdf-audio.html',
  '/accessibility.html',
  '/editorial-policy.html',
  '/site-map.html',
  '/about.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          SHELL_ASSETS.map(async (asset) => {
            const response = await fetch(asset, { cache: 'reload' });
            if (response.ok) await cache.put(asset, response);
          }),
        ),
      )
      .catch(() => undefined),
  );
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
  const networkRequest =
    event.request.mode === 'navigate' ? new Request(event.request, { cache: 'reload' }) : event.request;
  event.respondWith(
    fetch(networkRequest)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))),
  );
});
