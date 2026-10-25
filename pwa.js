"use strict";

// ----------------------------------------------------------------------------
// UYGULAMA OLARAK YÜKLE (PWA)
// Tarayıcı destekliyorsa (Chrome, Edge, Android) menüdeki "📲 Uygulamayı yükle"
// düğmesi yüklemeyi başlatır. iPhone/iPad'de (Safari) nasıl ekleneceği anlatılır.
// Yüklenen uygulama internetsiz de açılır (sw.js).
// ----------------------------------------------------------------------------
(() => {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* yoksay */ });
    });
  }

  const btn = document.getElementById("btn-install");
  const offlineNote = document.getElementById("offline-note");
  let deferred = null;

  const standalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIos = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS

  function refresh() {
    if (!btn) return;
    const show = !standalone() && (deferred || isIos());
    btn.style.display = show ? "block" : "none";
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();          // kendi düğmemizle göstereceğiz
    deferred = e;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    refresh();
    showModal("Yüklendi", "Manyetik-His uygulaması yüklendi. Artık ana ekranından ya da başlat menüsünden açabilirsin; internet olmadan da çalışır.");
  });

  if (btn) {
    btn.addEventListener("click", async () => {
      if (deferred) {
        deferred.prompt();
        try { await deferred.userChoice; } catch (e) { /* yoksay */ }
        deferred = null;
        refresh();
      } else if (isIos()) {
        showModal("Uygulamayı yükle (iPhone / iPad)",
          "1. Safari'de bu sayfayı aç.\n2. Alttaki (ya da üstteki) Paylaş düğmesine ⬆️ dokun.\n" +
          "3. \"Ana Ekrana Ekle\"yi seç ve Ekle'ye dokun.\n\nBundan sonra ana ekranındaki simgeden açabilirsin.");
      }
    });
  }

  function refreshOnline() {
    if (offlineNote) offlineNote.style.display = navigator.onLine ? "none" : "block";
  }
  window.addEventListener("online", refreshOnline);
  window.addEventListener("offline", refreshOnline);
  refreshOnline();
  refresh();

  window.__pwa = { refresh }; // testler için
})();
