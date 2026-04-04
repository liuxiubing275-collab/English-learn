const CACHE_NAME = 'ai-english-cache-v1';
const urlsToCache =[
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './NewWords.txt',
  './Texts.txt'
];

// 安装阶段：缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 激活阶段：清理旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 拦截网络请求：优先使用缓存（Stale-While-Revalidate 策略）
self.addEventListener('fetch', event => {
  // 对于 API 请求（如 SiliconFlow），直接走网络，不缓存
  if (event.request.url.includes('api.siliconflow.cn')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => {
        // 如果断网且没有缓存，返回什么都不做
      });
      // 优先返回缓存，同时在后台用网络请求更新缓存
      return cachedResponse || fetchPromise;
    })
  );
});