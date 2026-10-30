"use strict";

// ----------------------------------------------------------------------------
// NASIL OYNANIR: her oyun modu için kısa video + özet adımlar
// Videolar videolar/ klasöründedir (tools/video_uret.js ile üretilir).
// ----------------------------------------------------------------------------
const Yardim = (() => {
  const MODLAR = [
    { id: "tek", ad: "Tek oyunculu", ikon: "⏱", ozet: [
      "16 gizli kare: 4 N mıknatıs, 4 S mıknatıs, 4 demir, 4 bakır (ya da alüminyum).",
      "Test aracını sürükleyip kareye bırak; tepkiye bakarak maddeyi bul.",
      "N aracı İTERSE kare kesin N. İki araç da ÇEKERSE S. Yalnızca N aracı çekerse Fe. İkisi de tepki vermezse Cu/Al.",
      "Tespit taşını kareye bırak. Doğru +10, yanlış −5. Süre bitene dek taşları değiştirebilirsin.",
    ] },
    { id: "uzman", ad: "Uzman modu", ikon: "🎯", ozet: [
      "Menüde \"Uzman modu\" kutusunu işaretle, sonra Seviye 1'i başlat.",
      "İlk 24 test ücretsiz; her fazla test −1 puan. Sayaç sağda görünür.",
      "Test geçmişini kapatırsan (kutu) her şeyi aklında tutmalısın: tam hafıza oyunu.",
    ] },
    { id: "yz", ad: "Yapay zekâ (blöfsüz)", ikon: "🤖", ozet: [
      "Blöf kutusu boşken \"Yapay Zekâya Karşı\" düğmesine bas.",
      "Her tur bir zorunlu test + isteğe bağlı bir taş. Taş koymadan bitirmek pas sayılır.",
      "Doğru +10, yanlış −10. İlk konan taş kareyi kilitler.",
      "Herkes art arda 2 tam tur pas geçerse Zorunlu Tespit Turu başlar: test yok, herkes taş koyar.",
    ] },
    { id: "yzblof", ad: "Yapay zekâ (bloflu)", ikon: "🤥", ozet: [
      "Menüde \"Blöf modu\" kutusunu işaretle, sonra \"Yapay Zekâya Karşı\"ya bas.",
      "Testin gerçek tepkisini yalnızca testi yapan görür; rakibine doğruyu söyler ya da blöf yaparsın.",
      "Sıradaki oyuncu itiraz edebilir: blöfü yakalarsa +10 (blöfçü −10), haksız çıkarsa −10.",
      "Yapay zekâ da blöf yapar ve itiraz eder. Geçmişteki tepkilerin doğru olduğunu varsayma!",
    ] },
    { id: "cok", ad: "Çok oyunculu", ikon: "👥", ozet: [
      "Aynı cihazda 2–8 kişi sırayla oynar. 5+ oyuncuda tabla n×n olur.",
      "Çevrimiçi: hesap aç, yönetici onaylasın (davet koduyla anında), oda kur, 5 harfli kodu paylaş.",
      "Kurucu oyunu başlatır; herkes kendi cihazından oynar. Puanlar Sıralama'ya otomatik yazılır.",
      "Blöf modu çok oyunculu oyunlarda da açılabilir.",
    ] },
  ];

  const ekran = document.getElementById("help-screen");
  const govde = document.getElementById("help-body");
  const menu = document.getElementById("menu-screen");
  let secili = 0;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function ciz() {
    govde.innerHTML = "";
    const sekmeler = el("div", "help-tabs");
    MODLAR.forEach((m, i) => {
      const b = el("button", "set-opt" + (i === secili ? " on" : ""), `${m.ikon} ${m.ad}`);
      b.type = "button";
      b.addEventListener("click", () => { secili = i; ciz(); });
      sekmeler.appendChild(b);
    });
    govde.appendChild(sekmeler);

    const m = MODLAR[secili];
    const kart = el("div", "set-card");
    kart.appendChild(el("h2", "", `${m.ikon} ${m.ad}`));
    const v = document.createElement("video");
    v.className = "help-video";
    v.controls = true;
    v.preload = "metadata";
    v.setAttribute("playsinline", "");
    v.poster = `videolar/${m.id}.jpg`;
    v.src = `videolar/${m.id}.mp4`;
    kart.appendChild(v);
    kart.appendChild(el("p", "set-note", "Video internet gerektirir (altyazılıdır, sesi yoktur)."));
    const ul = el("ul", "help-list");
    m.ozet.forEach((t) => ul.appendChild(el("li", "", t)));
    kart.appendChild(ul);
    govde.appendChild(kart);
  }

  function ac() {
    menu.style.display = "none";
    ekran.style.display = "";
    ciz();
    window.scrollTo(0, 0);
  }
  function kapat() {
    govde.querySelectorAll("video").forEach((v) => v.pause());
    ekran.style.display = "none";
    menu.style.display = "";
  }
  document.getElementById("btn-help").addEventListener("click", ac);
  document.getElementById("btn-help-back").addEventListener("click", kapat);
  document.getElementById("btn-help-text").addEventListener("click", () => showRulesText());
  return { ac, kapat };
})();
