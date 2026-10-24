"use strict";

// ----------------------------------------------------------------------------
// SES EFEKTLERİ
// Web Audio ile tarayıcıda üretilir (ses dosyası yok). Sağ üstteki 🔊 düğmesiyle
// kapatılıp açılır; seçim cihazda hatırlanır.
// ----------------------------------------------------------------------------
const Ses = (() => {
  const KEY = "mh_ses";
  let ctx = null;
  let master = null;
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== "0"; } catch (e) { /* yoksay */ }

  // ---- yapı taşları (testlerde çevrimdışı çizimde de kullanılır) ----
  function tone(c, out, t, o) {
    const { f0, f1 = f0, dur = 0.15, type = "sine", gain = 0.2, attack = 0.005 } = o;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(c, out, t, o) {
    const { dur = 0.1, gain = 0.2, type = "lowpass", f0 = 800, f1 = f0, q = 1, attack = 0 } = o;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    if (attack > 0) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
    } else {
      g.gain.setValueAtTime(gain, t);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t);
  }

  // ---- ses tarifleri: (bağlam, çıkış, başlangıç zamanı) ----
  const TANIM = {
    // arayüz
    dokun: (c, o, t) => tone(c, o, t, { f0: 900, f1: 650, dur: 0.07, gain: 0.1 }),
    tik: (c, o, t) => tone(c, o, t, { f0: 1200, f1: 800, dur: 0.05, type: "triangle", gain: 0.16 }),
    // piyon kareye uçarken
    ucus: (c, o, t) => {
      // yumuşak, kısa bir "fışş": yavaş yükselir, hafifçe söner (patlama yok)
      noise(c, o, t, { dur: 0.3, gain: 0.5, attack: 0.1, type: "bandpass", f0: 500, f1: 900, q: 0.7 });
    },
    // çekme: yuvaya şak diye yapışır, titrer
    cekme: (c, o, t) => {
      tone(c, o, t, { f0: 320, f1: 90, dur: 0.22, gain: 0.4 });
      noise(c, o, t, { dur: 0.08, gain: 0.3, type: "lowpass", f0: 900 });
      for (let i = 0; i < 6; i++) {
        tone(c, o, t + 0.26 + i * 0.08, { f0: 110, f1: 100, dur: 0.06, type: "square", gain: 0.07 });
      }
    },
    // itme: yaylanıp yukarı fırlar
    itme: (c, o, t) => {
      tone(c, o, t, { f0: 180, f1: 640, dur: 0.28, gain: 0.32 });
      tone(c, o, t + 0.24, { f0: 640, f1: 420, dur: 0.3, type: "triangle", gain: 0.2 });
      tone(c, o, t + 0.5, { f0: 420, f1: 560, dur: 0.25, type: "triangle", gain: 0.14 });
    },
    // tepki yok: yumuşak, sönük bir "tok"
    yok: (c, o, t) => {
      tone(c, o, t, { f0: 200, f1: 140, dur: 0.16, type: "triangle", gain: 0.28 });
      noise(c, o, t, { dur: 0.04, gain: 0.1, type: "highpass", f0: 3000 });
    },
    // taş bırakma: tok bir tıkırtı ve küçük sekme
    tas: (c, o, t) => {
      noise(c, o, t, { dur: 0.09, gain: 0.5, type: "lowpass", f0: 700 });
      tone(c, o, t, { f0: 150, f1: 60, dur: 0.2, gain: 0.55 });
      tone(c, o, t + 0.15, { f0: 110, f1: 60, dur: 0.1, gain: 0.22 });
      noise(c, o, t + 0.15, { dur: 0.04, gain: 0.15, type: "lowpass", f0: 600 });
    },
    // blöf modu
    acikla: (c, o, t) => tone(c, o, t, { f0: 520, f1: 820, dur: 0.12, gain: 0.24 }),
    alarm: (c, o, t) => {
      for (let i = 0; i < 4; i++) {
        tone(c, o, t + i * 0.14, { f0: i % 2 ? 620 : 880, dur: 0.12, type: "square", gain: 0.13 });
      }
    },
    buzz: (c, o, t) => tone(c, o, t, { f0: 160, f1: 120, dur: 0.38, type: "sawtooth", gain: 0.24 }),
    // oyun akışı
    sira: (c, o, t) => {
      tone(c, o, t, { f0: 880, dur: 0.36, gain: 0.22 });
      tone(c, o, t, { f0: 1320, dur: 0.3, gain: 0.1 });
    },
    katil: (c, o, t) => {
      tone(c, o, t, { f0: 660, dur: 0.12, type: "triangle", gain: 0.2 });
      tone(c, o, t + 0.12, { f0: 880, dur: 0.18, type: "triangle", gain: 0.2 });
    },
    zorunlu: (c, o, t) => {
      tone(c, o, t, { f0: 90, f1: 55, dur: 0.55, gain: 0.5 });
      noise(c, o, t, { dur: 0.12, gain: 0.3, type: "lowpass", f0: 400 });
    },
    bitis: (c, o, t) => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(c, o, t + i * 0.13, { f0: f, dur: 0.26, type: "triangle", gain: 0.24 }));
      [523.25, 659.25, 783.99].forEach((f) =>
        tone(c, o, t + 0.56, { f0: f, dur: 0.7, type: "triangle", gain: 0.13 }));
    },
  };

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor(); // üst üste seslerde patlamayı önler
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => { /* yoksay */ });
    return ctx;
  }

  function play(name) {
    if (!enabled) return;
    const fn = TANIM[name];
    if (!fn) return;
    try {
      const c = ensure();
      if (c) fn(c, master, c.currentTime + 0.01);
    } catch (e) { /* ses hatası oyunu bozmasın */ }
  }

  function refreshButton() {
    const b = document.getElementById("btn-sound");
    if (!b) return;
    b.textContent = enabled ? "🔊" : "🔇";
    b.setAttribute("aria-label", enabled ? "Sesi kapat" : "Sesi aç");
    b.title = enabled ? "Sesi kapat" : "Sesi aç";
    b.classList.toggle("off", !enabled);
  }

  function setEnabled(v) {
    enabled = !!v;
    try { localStorage.setItem(KEY, enabled ? "1" : "0"); } catch (e) { /* yoksay */ }
    refreshButton();
    if (enabled) play("tik");
  }

  // Tarayıcılar sesi kullanıcı etkileşiminden önce başlatmaz: ilk dokunuşta hazırla.
  ["pointerdown", "keydown"].forEach((ev) =>
    document.addEventListener(ev, () => { if (enabled) ensure(); }, { passive: true }));

  // Düğmelere basınca hafif bir tık
  document.addEventListener("click", (e) => {
    if (e.target && e.target.closest && e.target.closest(".big-btn, .ol-small, .ol-tab, .card-tile, .card-tab, .link-btn")) {
      play("dokun");
    }
  });

  const btn = document.getElementById("btn-sound");
  if (btn) btn.addEventListener("click", () => setEnabled(!enabled));
  refreshButton();

  return {
    play,
    setEnabled,
    toggle: () => setEnabled(!enabled),
    get enabled() { return enabled; },
    names: Object.keys(TANIM),
    // testler için: tarifi verilen bağlama çiz
    _render: (name, c, out) => TANIM[name](c, out, 0),
  };
})();
