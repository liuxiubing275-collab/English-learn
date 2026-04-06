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

// 安装阶段
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching core assets');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// 激活阶段
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

// 核心：修复后的拦截逻辑
self.addEventListener('fetch', event => {
  // 1. 跳过非 GET 请求和 AI API 请求
  if (event.request.method !== 'GET' || event.request.url.includes('api.siliconflow.cn')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // 这里的逻辑是：如果有缓存，先回传缓存，同时去后台更新网络
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // 关键修复点：先判断响应是否有效
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // 关键修复点：必须先克隆，再进行缓存操作
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(err => {
        console.log('Fetch failed; returning cached response if available');
      });

      // 返回缓存响应（如果有），否则等待网络请求
      return cachedResponse || fetchPromise;
    })
  );
});
🛠 接下来你还需要做两件事：
1. 清理旧的“坏掉”的 Service Worker
由于旧的 SW 已经运行在你的浏览器里，你需要强制注销它：
在浏览器（Chrome 或 Safari）中打开开发者工具。
找到 Application (应用) -> Service Workers。
点击 Unregister (注销)。
刷新页面，让新的 sw.js 重新安装。
2. 检查 app.js 中的数据加载
如果按钮还是没反应，请检查你的主 JS 文件（app.js）中的 loadAllData 函数。为了防止它静默失败，建议给它加上日志：
code
JavaScript
async function loadAllData() {
    try {
        console.log("开始加载数据...");
        const aRes = await fetch('Texts.txt');
        if (!aRes.ok) throw new Error("无法读取 Texts.txt");
        
        const aText = await aRes.text();
        console.log("读取文章数据成功，长度:", aText.length);
        
        // ... 你的解析逻辑 ...
        
        console.log("文章列表初始化完成，当前段落数:", articleList.length);
    } catch (e) {
        console.error("数据加载失败:", e);
        alert("数据加载失败，请检查文件是否存在并刷新页面。");
    }
}