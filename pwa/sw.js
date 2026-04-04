// pwa/sw.js

const CACHE_NAME = 'ai-english-v1';

const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/data/NewWords.txt',
  '/data/Texts.txt'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});