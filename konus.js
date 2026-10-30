"use strict";

// ----------------------------------------------------------------------------
// SESLİ OKUMA: oyundaki mesajları tarayıcının konuşma sentezi (speechSynthesis) ile okur.
// Ses dosyası yoktur; sesi cihaz üretir (Türkçe ses cihaza göre değişir). Ayarlar'dan
// açılıp kapatılır, hız seçilir. Varsayılan: kapalı.
// ----------------------------------------------------------------------------
const Konus = (() => {
  const KEY = "mh_konus";
  const destek = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let acik = false;
  let hiz = 1;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s) { acik = !!s.acik; if (s.hiz >= 0.6 && s.hiz <= 1.6) hiz = s.hiz; }
  } catch (e) { /* yoksay */ }

  function kaydet() {
    try { localStorage.setItem(KEY, JSON.stringify({ acik, hiz })); } catch (e) { /* yoksay */ }
  }

  let ses = null;
  function sesSec() {
    if (!destek) return null;
    const l = speechSynthesis.getVoices();
    ses = l.find((v) => /^tr[-_]TR$/i.test(v.lang)) || l.find((v) => /^tr/i.test(v.lang)) || null;
    return ses;
  }
  if (destek) {
    sesSec();
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", sesSec);
  }
  function trSesVar() { return !!(destek && (ses || sesSec())); }

  // Okunacak metni düzelt: simgeleri/emojileri at, kısaltmaları açıkça söyle
  function temizle(t) {
    return String(t)
      .replace(/[←-⇿⬀-⯿]/gu, " ")
      .replace(/\p{Extended_Pictographic}/gu, " ")
      .replace(/[■-◿☀-➿️]/gu, " ")
      .replace(/[−–]\s?(\d)/g, "eksi $1")
      .replace(/\+\s?(\d)/g, "artı $1")
      .replace(/\s*\((Fe|Cu|Al)\)/g, "")
      .replace(/\bFe\b/g, "demir")
      .replace(/\bCu\b/g, "bakır")
      .replace(/\bAl\b/g, "alüminyum")
      .replace(/\b([A-H])([1-8])\b/g, "$1 $2")
      .replace(/×/g, " çarpı ")
      .replace(/[“”"]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sustur() { if (destek) speechSynthesis.cancel(); }

  // zorla: ayar kapalıyken de oku (ör. video anlatımı, "Dene" düğmesi)
  function soyle(metin, o = {}) {
    if (!destek) { if (o.bitince) o.bitince(); return false; }
    const t = temizle(metin);
    if (!t) { if (o.bitince) o.bitince(); return false; }
    if (!o.sirala) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "tr-TR";
    if (ses || sesSec()) u.voice = ses;
    u.rate = o.hiz || hiz;
    let bitti = false;
    const bit = () => { if (!bitti) { bitti = true; if (o.bitince) o.bitince(); } };
    u.onend = bit;
    u.onerror = bit;
    speechSynthesis.speak(u);
    return true;
  }

  // ---- oyun mesajlarını izle ----
  const lblMsg = document.getElementById("lbl-msg");
  const lblTurn = document.getElementById("lbl-turn");
  const mTitle = document.getElementById("modal-title");
  const mBody = document.getElementById("modal-body");
  const oyunEkrani = document.getElementById("game-screen");
  let bekleyen = { modal: "", msg: "", sira: "" };
  let zamanlayici = null;
  let sonMsg = "";
  let sonSira = "";

  function oyundaMi() { return oyunEkrani && oyunEkrani.style.display !== "none"; }
  function oku() {
    zamanlayici = null;
    const b = bekleyen;
    bekleyen = { modal: "", msg: "", sira: "" };
    if (!acik) return;
    const parcalar = [b.modal, b.sira, b.msg].filter(Boolean);
    if (parcalar.length) soyle(parcalar.join(". "));
  }
  function planla() { if (!zamanlayici) zamanlayici = setTimeout(oku, 250); }

  function siraMetni() {
    // "▲ Sıra: Oyuncu 2 · ..." gibi etiketten yalnızca sırayı al
    const t = (lblTurn.textContent || "").trim();
    const m = t.match(/Sıra:\s*([^·|(\n]+)/);
    return m ? "Sıra " + m[1].trim() : "";
  }

  if (destek && lblMsg) {
    new MutationObserver(() => {
      if (!acik || !oyundaMi()) return;
      const t = (lblMsg.textContent || "").trim();
      if (t && t !== sonMsg) { sonMsg = t; bekleyen.msg = t; planla(); }
    }).observe(lblMsg, { childList: true, characterData: true, subtree: true });

    new MutationObserver(() => {
      if (!acik || !oyundaMi()) return;
      const t = siraMetni();
      if (t && t !== sonSira) { sonSira = t; bekleyen.sira = t; planla(); }
    }).observe(lblTurn, { childList: true, characterData: true, subtree: true });

    const modalIzle = () => {
      const o = document.getElementById("modal-overlay");
      if (!acik || !o || o.style.display === "none") return;
      bekleyen.modal = [mTitle.textContent, mBody.textContent].filter(Boolean).join(". ");
      bekleyen.msg = ""; bekleyen.sira = "";
      planla();
    };
    new MutationObserver(modalIzle).observe(document.getElementById("modal-overlay"),
      { attributes: true, attributeFilter: ["style"] });
  }

  // Oyun bırakılıp yeni oyun başlayınca tekrar tutmasın
  document.addEventListener("click", (e) => {
    if (e.target && e.target.closest && e.target.closest("#btn-menu, #modal-close")) { sustur(); sonMsg = ""; sonSira = ""; }
  });

  function ayarla(v) {
    acik = !!v;
    kaydet();
    if (!acik) sustur();
    sonMsg = ""; sonSira = "";
  }
  function hizAyarla(h) { hiz = h; kaydet(); }

  return {
    destek, soyle, sustur, ayarla, hizAyarla, temizle, trSesVar,
    get acik() { return acik; },
    get hiz() { return hiz; },
  };
})();
