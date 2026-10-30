"use strict";

// ----------------------------------------------------------------------------
// AYARLAR: tema, taş renkleri, test aracı renkleri, nötr malzeme (bakır / alüminyum)
// Seçimler bu cihazda saklanır (localStorage). Oyun kuralları değişmez; yalnızca görünüm.
// ----------------------------------------------------------------------------
const Ayarlar = (() => {
  const KEY = "mh_ayar";
  const TEMALAR = [
    { id: "tahta", ad: "☀ Açık tahta", renk: ["#d9b27c", "#8a5a2b"] },
    { id: "ceviz", ad: "🌰 Koyu ceviz", renk: ["#6b4a30", "#3e2916"] },
    { id: "gece", ad: "🌙 Gece mavisi", renk: ["#2d3f63", "#2f4a7a"] },
    { id: "kece", ad: "🟩 Yeşil keçe", renk: ["#3f7a58", "#2f6b4f"] },
  ];
  const TAS_SETLERI = [
    { ad: "Klasik", renk: PLAYER_STYLES.map((s) => s.color) },
    { ad: "Pastel", renk: ["#6fa8dc", "#7fc68a", "#f2b269", "#b99bd6", "#6cc3cb", "#f08fb3", "#e58b82", "#9aa5ad"] },
    { ad: "Koyu", renk: ["#123f86", "#17622f", "#9a5200", "#5b2a74", "#00626d", "#8e2152", "#7d2118", "#33393d"] },
    { ad: "Canlı", renk: ["#0066ff", "#00c853", "#ff9100", "#aa00ff", "#00e5ff", "#ff4081", "#ff1744", "#607d8b"] },
  ];
  const ARAC_SETLERI = [
    { ad: "Klasik (N kırmızı, Fe gri)", N: "#e2574a", Fe: "#a3adb6" },
    { ad: "Mor / Altın", N: "#8e44ad", Fe: "#d4a72c" },
    { ad: "Turuncu / Mavi", N: "#f08a24", Fe: "#3b82c4" },
    { ad: "Siyah / Beyaz", N: "#2b2b2b", Fe: "#f1f1f1" },
  ];
  const VARSAYILAN = {
    tema: "tahta",
    tas: TAS_SETLERI[0].renk.slice(),
    N: ARAC_SETLERI[0].N,
    Fe: ARAC_SETLERI[0].Fe,
    notr: "Cu",
  };
  const HEX = /^#[0-9a-fA-F]{6}$/;
  let a = Object.assign({}, VARSAYILAN, { tas: VARSAYILAN.tas.slice() });

  function yukle() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!s || typeof s !== "object") return;
      if (TEMALAR.some((t) => t.id === s.tema)) a.tema = s.tema;
      if (Array.isArray(s.tas)) s.tas.slice(0, 8).forEach((c, i) => { if (HEX.test(c)) a.tas[i] = c; });
      if (HEX.test(s.N)) a.N = s.N;
      if (HEX.test(s.Fe)) a.Fe = s.Fe;
      if (s.notr === "Al" || s.notr === "Cu") a.notr = s.notr;
    } catch (e) { /* bozuk kayıt: varsayılanlar */ }
  }
  function kaydet() {
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* yoksay */ }
  }

  // #rrggbb rengini oranla koyulaştır (piyon gövdesinin gölgesi için)
  function koyulastir(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function uygula() {
    const root = document.documentElement;
    root.setAttribute("data-tema", a.tema);
    const tm = TEMALAR.find((t) => t.id === a.tema);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && tm) meta.setAttribute("content", tm.renk[1]);
    PLAYER_STYLES.forEach((s, i) => { s.color = a.tas[i]; });
    ["N", "Fe"].forEach((t) => {
      root.style.setProperty("--pawn-" + t, a[t]);
      root.style.setProperty("--pawn-" + t + "2", koyulastir(a[t], 0.62));
    });
    NOTR_ETIKET = a.notr === "Al" ? "Al" : "Cu";
  }

  // ---------------- arayüz ----------------
  const ekran = document.getElementById("settings-screen");
  const govde = document.getElementById("settings-body");
  const menu = document.getElementById("menu-screen");

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function secenek(metin, acik, fn, renkler) {
    const b = el("button", "set-opt" + (acik ? " on" : ""), metin);
    b.type = "button";
    if (renkler) {
      const sw = el("span", "set-swatch");
      renkler.forEach((c) => { const i = el("i"); i.style.background = c; sw.appendChild(i); });
      b.appendChild(sw);
    }
    b.addEventListener("click", fn);
    return b;
  }
  function renkSecici(etiket, deger, fn) {
    const w = el("label", "set-pick");
    const inp = el("input");
    inp.type = "color";
    inp.value = deger;
    inp.addEventListener("input", () => fn(inp.value));
    w.append(inp, el("span", "", etiket));
    return w;
  }
  function degistir(fn) { fn(); kaydet(); uygula(); ciz(); }

  function onizleme() {
    const w = el("div", "set-preview");
    [0, 1, 2, 3].forEach((i) => w.appendChild(makeStone(MATERIALS[i], i)));
    TOOLS.forEach((t) => w.appendChild(makePawn(t)));
    return w;
  }

  function ciz() {
    govde.innerHTML = "";

    let k = el("div", "set-card");
    k.appendChild(el("h2", "", "🎨 Tema"));
    let r = el("div", "set-row");
    TEMALAR.forEach((t) => r.appendChild(secenek(t.ad, a.tema === t.id,
      () => degistir(() => { a.tema = t.id; }), t.renk)));
    k.appendChild(r);
    govde.appendChild(k);

    k = el("div", "set-card");
    k.appendChild(el("h2", "", "⬛ Tespit taşı renkleri (oyuncu 1–8)"));
    r = el("div", "set-row");
    TAS_SETLERI.forEach((s) => r.appendChild(secenek(s.ad, s.renk.every((c, i) => c === a.tas[i]),
      () => degistir(() => { a.tas = s.renk.slice(); }), s.renk.slice(0, 4))));
    k.appendChild(r);
    r = el("div", "set-row");
    a.tas.forEach((c, i) => r.appendChild(renkSecici("Oyuncu " + (i + 1), c, (v) => {
      a.tas[i] = v; kaydet(); uygula(); onizlemeYenile();
    })));
    k.appendChild(r);
    k.appendChild(el("p", "set-note", "Taşın rengi oyuncuyu gösterir; köşedeki şekil renk körlüğü için ek işarettir."));
    govde.appendChild(k);

    k = el("div", "set-card");
    k.appendChild(el("h2", "", "♟ Test aracı renkleri"));
    r = el("div", "set-row");
    ARAC_SETLERI.forEach((s) => r.appendChild(secenek(s.ad, s.N === a.N && s.Fe === a.Fe,
      () => degistir(() => { a.N = s.N; a.Fe = s.Fe; }), [s.N, s.Fe])));
    k.appendChild(r);
    r = el("div", "set-row");
    r.appendChild(renkSecici("N aracı", a.N, (v) => { a.N = v; kaydet(); uygula(); onizlemeYenile(); }));
    r.appendChild(renkSecici("Demir aracı", a.Fe, (v) => { a.Fe = v; kaydet(); uygula(); onizlemeYenile(); }));
    k.appendChild(r);
    govde.appendChild(k);

    k = el("div", "set-card");
    k.appendChild(el("h2", "", "4. malzeme: bakır mı, alüminyum mu?"));
    r = el("div", "set-row");
    r.appendChild(secenek("Bakır (Cu)", a.notr === "Cu", () => degistir(() => { a.notr = "Cu"; })));
    r.appendChild(secenek("Alüminyum (Al)", a.notr === "Al", () => degistir(() => { a.notr = "Al"; })));
    k.appendChild(r);
    k.appendChild(el("p", "set-note",
      "Her ikisi de iki test aracına tepki vermez; oyun kuralı değişmez, yalnızca taşın üzerindeki yazı değişir. " +
      "Çevrimiçi oyunda herkes kendi ekranındaki seçimi görür."));
    govde.appendChild(k);

    k = el("div", "set-card");
    k.appendChild(el("h2", "", "🔊 Sesli okuma"));
    if (typeof Konus === "undefined" || !Konus.destek) {
      k.appendChild(el("p", "set-note", "Bu tarayıcı sesli okumayı desteklemiyor."));
    } else {
      r = el("div", "set-row");
      r.appendChild(secenek("Kapalı", !Konus.acik, () => { Konus.ayarla(false); ciz(); }));
      r.appendChild(secenek("Açık", Konus.acik, () => { Konus.ayarla(true); Konus.soyle("Sesli okuma açık."); ciz(); }));
      k.appendChild(r);
      r = el("div", "set-row");
      [["Yavaş", 0.8], ["Normal", 1], ["Hızlı", 1.25]].forEach(([ad, h]) =>
        r.appendChild(secenek(ad, Math.abs(Konus.hiz - h) < 0.01, () => { Konus.hizAyarla(h); Konus.soyle("Sıra Oyuncu 2'de. A1 karesine demir taşı bırakıldı."); ciz(); })));
      k.appendChild(r);
      k.appendChild(el("p", "set-note",
        "Oyundaki mesajları (sıra, test tepkisi, puan, sonuç) yüksek sesle okur. Sesi cihazın kendisi üretir; " +
        (Konus.trSesVar() ? "bu cihazda Türkçe ses bulundu." : "bu cihazda Türkçe ses bulunamadı, ses robotik ya da yabancı aksanlı olabilir.")));
    }
    govde.appendChild(k);

    k = el("div", "set-card");
    k.appendChild(el("h2", "", "👀 Önizleme"));
    prev = onizleme();
    k.appendChild(prev);
    const sifirla = secenek("↺ Varsayılana dön", false, () => degistir(() => {
      a = Object.assign({}, VARSAYILAN, { tas: VARSAYILAN.tas.slice() });
    }));
    const sr = el("div", "set-row");
    sr.appendChild(sifirla);
    k.appendChild(sr);
    govde.appendChild(k);
  }
  let prev = null;
  function onizlemeYenile() {
    if (!prev) return;
    const yeni = onizleme();
    prev.replaceWith(yeni);
    prev = yeni;
  }

  function ac() {
    menu.style.display = "none";
    ekran.style.display = "";
    ciz();
    window.scrollTo(0, 0);
  }
  function kapat() {
    ekran.style.display = "none";
    menu.style.display = "";
  }
  document.getElementById("btn-settings").addEventListener("click", ac);
  document.getElementById("btn-settings-back").addEventListener("click", kapat);

  yukle();
  uygula();
  return { ac, kapat, get: () => a, uygula };
})();
