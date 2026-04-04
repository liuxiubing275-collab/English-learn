// js/sw-register.js

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./pwa/sw.js')
      .then(() => console.log('✅ PWA 已启用'))
      .catch(err => console.log('❌ SW 失败', err));
  });
}