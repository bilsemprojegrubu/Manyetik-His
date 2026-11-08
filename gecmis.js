"use strict";

// ----------------------------------------------------------------------------
// GEÇMİŞ VE ANALİZ: biten oyunlar bu cihazda (localStorage) saklanır; menüdeki
// "Geçmiş ve Analiz" ekranı geçmiş listesini ve kişisel istatistikleri gösterir.
// Sunucuya hiçbir şey gönderilmez. En fazla SINIR oyun tutulur.
// ----------------------------------------------------------------------------
const Gecmis = (() => {
  const KEY = "mh_gecmis";
  const SINIR = 200;
  const MODLAR = {
    tek: "Tek kişilik",
    uzman: "Uzman",
    yz: "Yapay zekâ",
    yzblof: "YZ (blöflü)",
    cok: "Çok oyunculu",
    online: "Çevrimiçi",
  };
  const MALZEMELER = ["N", "S", "Fe", "Cu"];

  function oku() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function yaz(liste) {
    try { localStorage.setItem(KEY, JSON.stringify(liste.slice(-SINIR))); } catch (e) { /* yoksay */ }
  }

  // Biten oyunu kaydet. g: Game ya da çevrimiçi oyun nesnesi; sure: saniye (yalnızca tek kişilik)
  function kaydet(g, sure) {
    try {
      const online = !!g.remote;
      const me = online ? g.me : 0;
      const mod = online ? "online"
        : g.level === 1 ? (g.expert ? "uzman" : "tek")
        : g.ai >= 0 ? (g.bluff ? "yzblof" : "yz") : "cok";
      const s = (online && g.finalScores) ? g.finalScores : g.scores();
      const mal = {};
      let dogru = 0, toplam = 0;
      const tahta = g.board || [];
      for (const [cell, f] of g.flags.entries()) {
        if (f.player !== me || tahta[cell] === undefined) continue;
        const d = tahta[cell] === f.sym ? 1 : 0;
        mal[f.sym] = mal[f.sym] || [0, 0];
        mal[f.sym][0] += d;
        mal[f.sym][1]++;
        dogru += d;
        toplam++;
      }
      let test = 0, blof = 0;
      const arac = {};
      for (const arr of g.tests.values()) {
        for (const t of arr) {
          if (t.player !== me) continue;
          test++;
          arac[t.tool] = (arac[t.tool] || 0) + 1;
          if (t.real !== undefined && t.result !== undefined && t.real !== t.result) blof++;
        }
      }
      const enYuksek = Math.max(...s);
      const kayit = {
        t: Date.now(), mod, n: s.length, boyut: g.size,
        puan: s[me], kazandi: s.length > 1 ? s[me] === enYuksek : null,
        dogru, toplam, test, blof, mal, arac,
      };
      if (sure) kayit.sure = Math.round(sure * 10) / 10;
      if (mod === "cok") kayit.puanlar = s.slice();
      const liste = oku();
      liste.push(kayit);
      yaz(liste);
    } catch (e) { /* geçmiş kaydı oyunu asla bozmasın */ }
  }

  // ---- ekran ----
  const menu = document.getElementById("menu-screen");
  const ekran = document.getElementById("history-screen");
  const govde = document.getElementById("history-body");
  let filtre = "hepsi";

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const yuzde = (a, b) => (b ? Math.round((100 * a) / b) : null);
  const ort = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  function tarih(t) {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function malAd(s) {
    return typeof matLabel === "function" ? matLabel(s) : s;
  }

  function kutu(deger, etiket) {
    const k = el("div", "gc-tile");
    k.appendChild(el("div", "gc-num", String(deger)));
    k.appendChild(el("div", "gc-lbl", etiket));
    return k;
  }

  function cubuk(ad, oran, ek) {
    const r = el("div", "gc-bar-row");
    r.appendChild(el("span", "gc-bar-name", ad));
    const t = el("div", "gc-bar");
    const i = el("div", "gc-bar-fill");
    i.style.width = (oran === null ? 0 : oran) + "%";
    if (oran !== null && oran < 60) i.classList.add("low");
    t.appendChild(i);
    r.appendChild(t);
    r.appendChild(el("span", "gc-bar-val", oran === null ? "–" : `%${oran}${ek ? " " + ek : ""}`));
    return r;
  }

  // Son oyunların taş doğruluğu (%) çizgisi
  function egri(degerler) {
    const W = 300, H = 90, P = 8;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "gc-chart");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Son oyunlardaki doğruluk yüzdesi");
    const x = (i) => (degerler.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (degerler.length - 1));
    const y = (v) => H - P - (v / 100) * (H - 2 * P);
    [0, 50, 100].forEach((v) => {
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", P); l.setAttribute("x2", W - P);
      l.setAttribute("y1", y(v)); l.setAttribute("y2", y(v));
      l.setAttribute("class", "gc-grid");
      svg.appendChild(l);
    });
    const pl = document.createElementNS(ns, "polyline");
    pl.setAttribute("points", degerler.map((v, i) => `${x(i)},${y(v)}`).join(" "));
    pl.setAttribute("class", "gc-line");
    svg.appendChild(pl);
    degerler.forEach((v, i) => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", x(i)); c.setAttribute("cy", y(v)); c.setAttribute("r", 3.5);
      c.setAttribute("class", "gc-dot");
      svg.appendChild(c);
    });
    return svg;
  }

  function ipucu(liste) {
    const mal = {};
    for (const k of liste) for (const [s, [d, n]] of Object.entries(k.mal || {})) {
      mal[s] = mal[s] || [0, 0];
      mal[s][0] += d; mal[s][1] += n;
    }
    const adaylar = Object.entries(mal).filter(([, [, n]]) => n >= 3)
      .map(([s, [d, n]]) => [s, d / n]).sort((a, b) => a[1] - b[1]);
    const satir = [];
    if (adaylar.length && adaylar[0][1] < 0.8) {
      satir.push(`En çok ${malAd(adaylar[0][0])} taşında yanılıyorsun (%${Math.round(adaylar[0][1] * 100)} doğru). ` +
        "Bu malzemenin test tepkilerini Kartlara Göz At bölümünden tekrar et.");
    } else if (adaylar.length) {
      satir.push("Tüm malzemelerde başarılısın. Uzman modu ya da yapay zekâ karşı oynamayı dene.");
    }
    const uz = liste.filter((k) => k.mod === "tek" && k.sure);
    if (uz.length >= 3) {
      const son = ort(uz.slice(-3).map((k) => k.sure)), once = ort(uz.slice(0, -3).map((k) => k.sure));
      if (uz.length > 3 && son < once) satir.push("Son oyunlarında daha hızlısın.");
    }
    return satir;
  }

  function ciz() {
    govde.textContent = "";
    const hepsi = oku();
    if (!hepsi.length) {
      const k = el("div", "set-card");
      k.appendChild(el("p", "set-note", "Henüz biten bir oyun yok. Bir oyun oynayıp bitirince burada geçmişin ve analizin görünür."));
      govde.appendChild(k);
      return;
    }

    // Filtre
    const fr = el("div", "set-row");
    const secenekler = [["hepsi", "Hepsi"]].concat(Object.keys(MODLAR).filter((m) => hepsi.some((k) => k.mod === m)).map((m) => [m, MODLAR[m]]));
    if (!secenekler.some(([m]) => m === filtre)) filtre = "hepsi";
    secenekler.forEach(([m, ad]) => {
      const b = el("button", "set-opt" + (m === filtre ? " on" : ""), ad);
      b.type = "button";
      b.addEventListener("click", () => { filtre = m; ciz(); });
      fr.appendChild(b);
    });
    govde.appendChild(fr);

    const liste = filtre === "hepsi" ? hepsi : hepsi.filter((k) => k.mod === filtre);
    // Kişisel analizde yalnızca tek insan oyuncunun modları (aynı cihazdaki çok oyunculu hariç)
    const kisisel = liste.filter((k) => k.mod !== "cok" && k.toplam > 0);

    let k = el("div", "set-card");
    k.appendChild(el("h2", "", "📊 Özet"));
    const izgara = el("div", "gc-tiles");
    izgara.appendChild(kutu(liste.length, "oyun"));
    izgara.appendChild(kutu(liste.length ? Math.max(...liste.map((o) => o.puan)) : "–", "en yüksek puan"));
    izgara.appendChild(kutu(liste.length ? Math.round(ort(liste.map((o) => o.puan)) * 10) / 10 : "–", "ortalama puan"));
    const d = kisisel.reduce((s, o) => s + o.dogru, 0), n = kisisel.reduce((s, o) => s + o.toplam, 0);
    izgara.appendChild(kutu(n ? `%${yuzde(d, n)}` : "–", "doğru taş"));
    izgara.appendChild(kutu(kisisel.length ? Math.round(ort(kisisel.map((o) => o.test)) * 10) / 10 : "–", "oyun başı test"));
    const rek = liste.filter((o) => o.kazandi !== null);
    izgara.appendChild(kutu(rek.length ? `%${yuzde(rek.filter((o) => o.kazandi).length, rek.length)}` : "–", "kazanma"));
    k.appendChild(izgara);
    govde.appendChild(k);

    if (kisisel.length) {
      k = el("div", "set-card");
      k.appendChild(el("h2", "", "📈 Doğruluk (son oyunlar)"));
      const son = kisisel.slice(-15).map((o) => yuzde(o.dogru, o.toplam));
      k.appendChild(egri(son));
      k.appendChild(el("p", "set-note", `Son ${son.length} oyunda koyduğun taşların doğru olma yüzdesi (soldan sağa eskiden yeniye).`));
      govde.appendChild(k);

      k = el("div", "set-card");
      k.appendChild(el("h2", "", "🧲 Malzeme bazında doğruluk"));
      const mal = {};
      for (const o of kisisel) for (const [s, [dg, nt]] of Object.entries(o.mal || {})) {
        mal[s] = mal[s] || [0, 0];
        mal[s][0] += dg; mal[s][1] += nt;
      }
      MALZEMELER.filter((s) => mal[s]).forEach((s) => k.appendChild(cubuk(malAd(s), yuzde(mal[s][0], mal[s][1]), `(${mal[s][1]} taş)`)));
      const araclar = {};
      for (const o of kisisel) for (const [a, c] of Object.entries(o.arac || {})) araclar[a] = (araclar[a] || 0) + c;
      const toplamTest = Object.values(araclar).reduce((x, y) => x + y, 0);
      if (toplamTest) {
        k.appendChild(el("p", "set-note", "Kullandığın test araçları: " +
          Object.entries(araclar).map(([a, c]) => `${typeof TOOL_NAMES !== "undefined" && TOOL_NAMES[a] || a} ${c}`).join(", ") + "."));
      }
      const blof = kisisel.reduce((s, o) => s + (o.blof || 0), 0);
      if (blof) k.appendChild(el("p", "set-note", `Blöflü oyunlarda ${blof} kez yalan söyledin.`));
      const ip = ipucu(kisisel);
      ip.forEach((t) => k.appendChild(el("p", "gc-tip", "💡 " + t)));
      govde.appendChild(k);
    }

    k = el("div", "set-card");
    k.appendChild(el("h2", "", "🕘 Geçmiş oyunlar"));
    const tablo = el("div", "gc-list");
    liste.slice().reverse().slice(0, 30).forEach((o) => {
      const r = el("div", "gc-item");
      const ust = el("div", "gc-item-top");
      ust.appendChild(el("b", "", MODLAR[o.mod] || o.mod));
      ust.appendChild(el("span", "gc-date", tarih(o.t)));
      r.appendChild(ust);
      let t = `${o.puan} puan`;
      if (o.toplam) t += ` · ${o.dogru}/${o.toplam} doğru`;
      if (o.sure) t += ` · ${o.sure.toFixed(1)} sn`;
      if (o.test) t += ` · ${o.test} test`;
      if (o.mod === "cok" && o.puanlar) t = "Puanlar: " + o.puanlar.join(" – ");
      else if (o.kazandi !== null) t += o.kazandi ? " · 🏆 kazandın" : " · kaybettin";
      r.appendChild(el("div", "gc-item-line", t));
      tablo.appendChild(r);
    });
    k.appendChild(tablo);
    if (liste.length > 30) k.appendChild(el("p", "set-note", `Son 30 oyun gösteriliyor (toplam ${liste.length}).`));
    govde.appendChild(k);

    k = el("div", "set-card");
    const sil = el("button", "set-opt", "🗑 Geçmişi temizle");
    sil.type = "button";
    sil.addEventListener("click", () => {
      if (confirm("Bu cihazdaki tüm oyun geçmişi silinsin mi? Bu işlem geri alınamaz.")) {
        try { localStorage.removeItem(KEY); } catch (e) { /* yoksay */ }
        ciz();
      }
    });
    k.appendChild(sil);
    k.appendChild(el("p", "set-note", "Geçmiş yalnızca bu cihazda saklanır; başka cihazla ya da sunucuyla paylaşılmaz."));
    govde.appendChild(k);
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
  document.getElementById("btn-history").addEventListener("click", ac);
  document.getElementById("btn-history-back").addEventListener("click", kapat);

  return { kaydet, ac, kapat, oku };
})();
