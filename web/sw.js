const CACHE = 'mastersafe-v7-10-8-cloud-auth-icon-clean';
const FILES = [
  './','./index.html','./share.html','./styles.css','./ui-pro.css','./ui-polish.css','./concept-b.css','./concept-b-enhance.js','./mockup-exact.css','./mockup-final.css','./ui-text-fix.css','./settings-ux.css','./settings-title-icons-clean.css','./mockup-final.js','./app.js','./smart.js','./cloud-config.js','./cloud.js','./quota.js','./ai.js','./beta.js','./privacidade.html','./termos.html','./manifest.json','./assets/icon.svg'
];
self.addEventListener('install', event => event.waitUntil((async()=>{
  await caches.open(CACHE).then(cache => cache.addAll(FILES));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return resp;
    }).catch(() => caches.match(event.request).then(r => r || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
    const copy = resp.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return resp;
  })));
});