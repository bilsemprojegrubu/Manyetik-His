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
  let deferred = window.__bip || null; // index.html'de erken yakalanan sinyal

  const standalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ua = () => navigator.userAgent;
  const isIos = () =>
    /iphone|ipad|ipod/i.test(ua()) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS
  const isAndroid = () => /android/i.test(ua());

  // Düğme her zaman görünür (yüklü uygulamanın içinde hariç). Tarayıcı yüklemeyi doğrudan
  // başlatamıyorsa tarayıcıya göre adım adım yönerge gösterilir.
  function refresh() {
    if (btn) btn.style.display = standalone() ? "none" : "block";
  }

  function yonerge() {
    const u = ua();
    if (isIos()) {
      return ["Uygulamayı yükle (iPhone / iPad)",
        "1. Safari'de bu sayfayı aç (başka tarayıcıda olmaz).\n2. Alttaki (ya da üstteki) Paylaş düğmesine ⬆️ dokun.\n" +
        "3. \"Ana Ekrana Ekle\"yi seç ve Ekle'ye dokun.\n\nBundan sonra ana ekranındaki simgeden açabilirsin."];
    }
    if (/firefox/i.test(u) && !isAndroid()) {
      return ["Uygulamayı yükle",
        "Firefox bilgisayarda siteleri uygulama olarak yüklemeyi desteklemiyor.\n\nChrome ya da Edge ile aynı adresi açarsan " +
        "yükleyebilirsin. (Oyun Firefox'ta sorunsuz oynanır.)"];
    }
    if (isAndroid()) {
      return ["Uygulamayı yükle (Android)",
        "1. Sağ üstteki ⋮ menüsünü aç.\n2. \"Uygulamayı yükle\" ya da \"Ana ekrana ekle\"yi seç.\n3. Yükle'ye dokun.\n\n" +
        "Menüde görünmüyorsa sayfayı bir kez kapatıp yeniden aç."];
    }
    if (/edg\//i.test(u)) {
      return ["Uygulamayı yükle (Edge)",
        "1. Adres çubuğunun sağındaki yükle simgesine ⊕ tıkla (varsa).\n" +
        "2. Yoksa sağ üstteki ⋯ menüsü → Uygulamalar → \"Bu siteyi uygulama olarak yükle\".\n3. Yükle'ye tıkla.\n\n" +
        "Görünmüyorsa sayfayı bir kez yenileyip tekrar dene."];
    }
    return ["Uygulamayı yükle (Chrome)",
      "1. Adres çubuğunun sağındaki yükle simgesine ⊕ tıkla (varsa).\n" +
      "2. Yoksa sağ üstteki ⋮ menüsü → \"Yayınla, kaydet ve paylaş\" → \"Sayfayı uygulama olarak yükle\" " +
      "(ya da doğrudan \"Uygulamayı yükle\").\n3. Yükle'ye tıkla.\n\nGörünmüyorsa sayfayı bir kez yenileyip tekrar dene."];
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
      deferred = deferred || window.__bip || null;
      if (deferred) {
        deferred.prompt();
        try { await deferred.userChoice; } catch (e) { /* yoksay */ }
        deferred = null;
        window.__bip = null;
        refresh();
      } else {
        const [baslik, metin] = yonerge();
        showModal(baslik, metin);
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
