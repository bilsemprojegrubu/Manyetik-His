"use strict";

// ----------------------------------------------------------------------------
// AYARLAR
// ----------------------------------------------------------------------------
const ROWS = "ABCDEFGH";
const MATERIALS = ["N", "S", "Fe", "Cu"];
const BASE_SIZE = 4;       // 2-4 oyuncuda tabla 4x4; 5+ oyuncuda oyuncu sayısı x oyuncu sayısı
const MAX_PLAYERS = 8;

const L1_CORRECT = 10, L1_WRONG = -5;
const L2_CORRECT = 10, L2_WRONG = -10;
const EXPERT_FREE_TESTS = 24;      // Uzman modu: bu kadar test ücretsiz, fazlası -1
const PASS_ROUNDS_FOR_FORCED = 2;  // art arda bu kadar tam tur pas -> Zorunlu Tespit Turu
const BLUFF_CAUGHT = 10;           // blöfü yakalayan +10, blöf yapan -10
const BLUFF_FALSE_ALARM = -10;     // haksız itiraz

const PLAYER_STYLES = [
  { name: "Mavi", color: "#1e6fd9", mark: "●" },
  { name: "Yeşil", color: "#2e9e4f", mark: "▲" },
  { name: "Turuncu", color: "#e07b00", mark: "■" },
  { name: "Mor", color: "#8e44ad", mark: "◆" },
  { name: "Turkuaz", color: "#0097a7", mark: "★" },
  { name: "Pembe", color: "#d6457f", mark: "✚" },
  { name: "Kırmızı", color: "#c0392b", mark: "⬟" },
  { name: "Gri", color: "#5f6b73", mark: "✖" },
];

// Supabase (skor tablosu). Publishable anahtar tarayıcıda açık durması için üretilmiştir;
// tabloya erişimi veritabanındaki RLS kuralları sınırlar.
const SUPABASE_URL = "https://yetpclbtvqqwktkufsyq.supabase.co";
const SUPABASE_KEY = "sb_publishable_H5FP5r8o4RH3dEtXUe4_UQ_u3tYvIhA";

const TOOL_NAMES = { Fe: "Demir Test Aracı", N: "N-Kutbu Test Aracı" };
const TOOLS = ["Fe", "N"];

const PULL = "cekme", PUSH = "itme", NONE = "yok";
const REACTIONS = [PULL, PUSH, NONE];
const REACTION_TEXT = {
  [PULL]: "⬇ ÇEKME - taş yuvaya yapıştı",
  [PUSH]: "⬆ İTME - taş havada kaldı, oturmadı",
  [NONE]: "• TEPKİ YOK - taş serbestçe oturdu",
};
const REACTION_SHORT = { [PULL]: "çeker", [PUSH]: "iter", [NONE]: "yok" };
const REACTION_BUBBLE = { [PULL]: "⬇ ÇEKME", [PUSH]: "⬆ İTME", [NONE]: "• TEPKİ YOK" };

const REDUCED_MOTION = window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, REDUCED_MOTION ? Math.min(ms, 150) : ms));

// ----------------------------------------------------------------------------
// OYUN MANTIĞI
// ----------------------------------------------------------------------------
function react(tool, material) {
  if (tool === "Fe") {
    return (material === "N" || material === "S") ? PULL : NONE;
  }
  if (tool === "N") {
    if (material === "N") return PUSH;
    if (material === "S" || material === "Fe") return PULL;
    return NONE;
  }
  throw new Error("unknown tool " + tool);
}

// 4x4'te 4'er adet. n x n tablada (n tek ise kare 4'e bölünmez) kalan Cu'ya eklenir.
function compositionFor(size) {
  const total = size * size;
  const base = Math.floor(total / 4);
  return { N: base, S: base, Fe: base, Cu: total - 3 * base };
}

function newBoard(comp) {
  const cells = [];
  for (const [m, n] of Object.entries(comp)) {
    for (let i = 0; i < n; i++) cells.push(m);
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

class Game {
  constructor(level, playerNames, opts = {}) {
    this.level = level;
    this.size = level === 2 && playerNames.length > BASE_SIZE ? playerNames.length : BASE_SIZE;
    this.comp = compositionFor(this.size);
    this.board = newBoard(this.comp);
    this.players = playerNames;
    this.ai = opts.ai ? playerNames.length - 1 : -1; // yapay zekâ son oyuncudur
    this.bluff = !!opts.bluff && level === 2;
    this.expert = !!opts.expert && level === 1;
    this.flags = new Map(); // cell -> {player, sym}
    this.tests = new Map(); // cell -> [{player, tool, real, result, exposed, confirmed}]
    this.bonus = new Array(playerNames.length).fill(0); // blöf itirazı puanları
    this.correct = level === 1 ? L1_CORRECT : L2_CORRECT;
    this.wrong = level === 1 ? L1_WRONG : L2_WRONG;
    this.current = 0;
    this.phase = "play"; // play | challenge | reveal | announce | ai | over
    this.testedThisTurn = false;
    this.flaggedThisTurn = false;
    this.passStreak = 0;
    this.forced = false;
    this.claim = null;   // son açıklanan test (sıradaki oyuncu itiraz edebilir)
    this.pending = null; // açıklaması bekleyen test
    this.testCount = 0;
    this.justPlaced = null;
    this.over = false;
  }

  get cellCount() { return this.size * this.size; }

  record(cell, player, tool, real, said) {
    if (!this.tests.has(cell)) this.tests.set(cell, []);
    const entry = { player, tool, real, result: said, exposed: false, confirmed: false };
    this.tests.get(cell).push(entry);
    return entry;
  }

  stonesUsed(player, sym) {
    let n = 0;
    for (const f of this.flags.values()) if (f.player === player && f.sym === sym) n++;
    return n;
  }

  stonesLeft(player, sym) {
    return this.comp[sym] - this.stonesUsed(player, sym);
  }

  allFlagged() {
    return this.flags.size === this.cellCount;
  }

  scores() {
    const s = this.bonus.slice();
    for (const [cell, { player, sym }] of this.flags.entries()) {
      s[player] += this.board[cell] === sym ? this.correct : this.wrong;
    }
    if (this.expert) s[0] -= Math.max(0, this.testCount - EXPERT_FREE_TESTS);
    return s;
  }
}

function cellName(i, size) {
  return `${ROWS[Math.floor(i / size)]}${(i % size) + 1}`;
}

// ----------------------------------------------------------------------------
// YAPAY ZEKÂ: çıkarım
// ----------------------------------------------------------------------------
// perspective >= 0: o oyuncunun kendi testlerinin gerçek sonucu bilinir, diğerlerinin
// açıklaması geçerli sayılır. perspective = -1: yalnızca herkese açıklanan sonuçlar.
// exclude: bir test kaydı sayılmaz (itiraz kararı için).
function possibleSets(game, perspective, exclude = null) {
  const n = game.cellCount;
  const build = (useOthers) => {
    const sets = [];
    for (let i = 0; i < n; i++) {
      const entries = game.tests.get(i) || [];
      sets.push(new Set(MATERIALS.filter((m) => entries.every((t) => {
        if (t === exclude) return true;
        const own = perspective >= 0 && t.player === perspective;
        if (!own && !useOthers) return true;
        return react(t.tool, m) === (own ? t.real : t.result);
      }))));
    }
    return sets;
  };
  const propagate = (sets) => {
    let changed = true, guard = 0;
    while (changed && guard++ < 40) {
      changed = false;
      for (const m of MATERIALS) {
        const need = game.comp[m];
        const cand = [], sure = [];
        sets.forEach((s, i) => {
          if (s.has(m)) { cand.push(i); if (s.size === 1) sure.push(i); }
        });
        if (cand.length === need) {
          for (const i of cand) if (sets[i].size > 1) { sets[i] = new Set([m]); changed = true; }
        }
        if (sure.length === need) {
          sets.forEach((s, i) => {
            if (!sure.includes(i) && s.has(m)) { s.delete(m); changed = true; }
          });
        }
      }
    }
    return sets;
  };
  let sets = build(true);
  if (sets.some((s) => s.size === 0)) sets = build(false); // çelişki: başkalarının sözüne güvenme
  const propagated = propagate(sets.map((s) => new Set(s)));
  return propagated.some((s) => s.size === 0) ? sets : propagated;
}

function expectedRemaining(set, tool) {
  const groups = new Map();
  for (const m of set) {
    const r = react(tool, m);
    groups.set(r, (groups.get(r) || 0) + 1);
  }
  let e = 0;
  for (const c of groups.values()) e += (c * c) / set.size;
  return e;
}

function aiChooseTest(game, p) {
  const sets = possibleSets(game, p);
  const options = [];
  for (let i = 0; i < game.cellCount; i++) {
    if (game.flags.has(i)) continue;
    const used = new Set((game.tests.get(i) || []).map((t) => t.tool));
    for (const tool of TOOLS) {
      if (used.has(tool)) continue;
      const gain = sets[i].size - expectedRemaining(sets[i], tool);
      options.push({ cell: i, tool, gain: gain + Math.random() * 0.01 });
    }
  }
  options.sort((a, b) => b.gain - a.gain);
  if (options.length && options[0].gain > 0.02) return options[0];
  const free = [];
  for (let i = 0; i < game.cellCount; i++) if (!game.flags.has(i)) free.push(i);
  if (!free.length) return null;
  return { cell: free[Math.floor(Math.random() * free.length)], tool: TOOLS[Math.floor(Math.random() * 2)] };
}

function aiChooseFlag(game, p, forced) {
  const sets = possibleSets(game, p);
  const sure = [];
  for (let i = 0; i < game.cellCount; i++) {
    if (!game.flags.has(i) && sets[i].size === 1) sure.push(i);
  }
  const usable = (cell, sym) => game.stonesLeft(p, sym) > 0;
  for (const cell of shuffled(sure)) {
    const sym = [...sets[cell]][0];
    if (usable(cell, sym)) return { cell, sym };
  }
  if (!forced) return null;
  // zorunlu tespit: en az belirsiz kareye en olası malzemeyi koy
  const open = [];
  for (let i = 0; i < game.cellCount; i++) if (!game.flags.has(i)) open.push(i);
  open.sort((a, b) => sets[a].size - sets[b].size);
  for (const cell of open) {
    const choices = [...sets[cell]].filter((m) => usable(cell, m));
    if (choices.length) return { cell, sym: choices[Math.floor(Math.random() * choices.length)] };
  }
  const cell = open[0];
  const sym = MATERIALS.find((m) => usable(cell, m));
  return { cell, sym };
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Yapay zekâ blöf kararı: duruma göre blöf yapar ya da yapmaz.
function aiDecideAnnouncement(game, p, cell, tool, real) {
  const ownSets = possibleSets(game, p);
  // herkesin bildiğine tutarlı yalanlar, kolay yakalanmaz
  const pub = possibleSets(game, -1);
  const lies = REACTIONS.filter((r) => r !== real &&
    [...pub[cell]].some((m) => react(tool, m) === r));
  if (!lies.length) return real;
  const aiKnowsCell = ownSets[cell].size === 1;
  const s = game.scores();
  const others = s.filter((_, i) => i !== p);
  const behind = others.length && Math.max(...others) > s[p];
  let prob = 0.15;
  if (aiKnowsCell) prob += 0.3; // yanlış bilgiyle rakibi yanlış bayrağa yönlendirebilir
  if (behind) prob += 0.1;
  return Math.random() < prob ? lies[Math.floor(Math.random() * lies.length)] : real;
}

// Yapay zekâ itiraz kararı
function aiShouldChallenge(game, p, claim) {
  const sets = possibleSets(game, p, claim.entry);
  const cell = claim.cell;
  const consistent = [...sets[cell]].some((m) => react(claim.tool, m) === claim.said);
  if (!consistent) return true; // kesin blöf
  return Math.random() < 0.1;
}

// ----------------------------------------------------------------------------
// ARAYÜZ
// ----------------------------------------------------------------------------
const menuScreen = document.getElementById("menu-screen");
const gameScreen = document.getElementById("game-screen");
const cardsScreen = document.getElementById("cards-screen");
const nameInputsDiv = document.getElementById("name-inputs");
const boardGrid = document.getElementById("board-grid");
const lblTitle = document.getElementById("lbl-title");
const lblTurn = document.getElementById("lbl-turn");
const lblInfo = document.getElementById("lbl-info");
const lblMsg = document.getElementById("lbl-msg");
const lblScore = document.getElementById("lbl-score");
const stoneTray = document.getElementById("stone-tray");
const toolTray = document.getElementById("tool-tray");
const actionPanel = document.getElementById("action-panel");
const chkHistory = document.getElementById("chk-history");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");

let game = null;
let cellEls = [];
let startTime = 0;
let finalTime = null;
let timerHandle = null;
let sel = null;      // seçili öğe: {kind: "stone"|"tool", value}
let busy = false;    // animasyon sürerken girdi kapalı
let traySig = "";

function showModal(title, body) {
  modalTitle.textContent = title;
  modalBody.textContent = body;
  modalOverlay.style.display = "flex";
}
document.getElementById("modal-close").addEventListener("click", () => {
  modalOverlay.style.display = "none";
});

function supaFetch(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

async function saveScore(name, puan, dogru, sure) {
  try {
    const res = await supaFetch("skorlar", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ oyuncu: name, puan, dogru, sure_sn: Math.round(sure * 10) / 10 }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function showLeaderboard() {
  showModal("🏆 En İyi 10", "Yükleniyor...");
  try {
    const res = await supaFetch(
      "skorlar?select=oyuncu,puan,sure_sn&order=puan.desc,sure_sn.asc&limit=10");
    if (!res.ok) throw new Error(res.status);
    const rows = await res.json();
    const text = rows.length
      ? rows.map((r, i) => `${i + 1}. ${r.oyuncu} — ${r.puan} puan (${r.sure_sn.toFixed(1)} sn)`).join("\n")
      : "Henüz kayıtlı skor yok. İlk skoru sen yap!";
    showModal("🏆 En İyi 10", text);
  } catch (e) {
    showModal("🏆 En İyi 10", "Skor tablosuna ulaşılamadı. İnternet bağlantını kontrol et.");
  }
}
document.getElementById("btn-leaders").addEventListener("click", showLeaderboard);

// ---------------- Menü ----------------
function buildNameInputs() {
  nameInputsDiv.innerHTML = "";
  const n = parseInt(document.querySelector('input[name="pcount"]:checked').value, 10);
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "name-input-row";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.textContent = PLAYER_STYLES[i].mark;
    dot.style.color = PLAYER_STYLES[i].color;
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 20;
    input.value = `Oyuncu ${i + 1}`;
    input.dataset.idx = i;
    row.appendChild(dot);
    row.appendChild(input);
    nameInputsDiv.appendChild(row);
  }
  const note = document.getElementById("board-note");
  note.textContent = n > BASE_SIZE
    ? `${n} oyuncuda tabla ${n}×${n} (${n * n} kare) olur.`
    : "2–4 oyuncuda tabla 4×4 (16 kare).";
}
document.querySelectorAll('input[name="pcount"]').forEach((r) =>
  r.addEventListener("change", buildNameInputs)
);
buildNameInputs();

document.getElementById("btn-level1").addEventListener("click", () =>
  startGame(1, ["Oyuncu"], { expert: document.getElementById("chk-expert").checked }));
document.getElementById("btn-level2").addEventListener("click", () => {
  const inputs = nameInputsDiv.querySelectorAll("input");
  const names = Array.from(inputs).map((inp, i) => inp.value.trim() || `Oyuncu ${i + 1}`);
  startGame(2, names, { bluff: document.getElementById("chk-bluff").checked });
});
document.getElementById("btn-ai").addEventListener("click", () => {
  const me = localStorage.getItem("oyuncuAdi") || "Sen";
  startGame(2, [me, "Yapay Zekâ"], { ai: true, bluff: document.getElementById("chk-bluff").checked });
});
document.getElementById("btn-help").addEventListener("click", () => {
  showModal("Nasıl oynanır?",
    "Tablada gizli maddeler var: N mıknatıs, S mıknatıs, Demir (Fe), Bakır (Cu).\n\n" +
    "Test araçları (piyonlar): bir aracı sürükleyip kareye bırak.\n" +
    " • Demir aracı: mıknatısı ÇEKER (N ve S), Fe ve Cu'ya tepki vermez.\n" +
    " • N aracı: N'yi İTER, S'yi ve Fe'yi ÇEKER, Cu'ya tepki vermez.\n\n" +
    "Tepkilerden maddeyi çıkarıp kareye tespit taşını (N, S, Fe, Cu) bırak.\n\n" +
    "Seviye 1: doğru +10, yanlış -5, en kısa sürede bitir. Taşları süre durana dek değiştirebilirsin. " +
    "Uzman modunda 24 test ücretsizdir, fazlası -1 puan.\n\n" +
    "Seviye 2: sırayla oynanır. Her tur bir zorunlu test ve isteğe bağlı bir taş yerleştirme içerir " +
    "(taş koymadan bitirmek pas). Her turda iki araçtan birini seçersin. İlk konan taş kareyi kilitler. " +
    "Doğru +10, yanlış -10. Herkes art arda iki tam tur pas geçerse Zorunlu Tespit Turu başlar.\n" +
    "5+ oyuncuda tabla büyür (oyuncu sayısı × oyuncu sayısı).\n\n" +
    "Blöf modu: test eden tepkiyi gizlice görür, sonra doğruyu ya da başka bir tepkiyi açıklar. " +
    "Sıradaki oyuncu itiraz edebilir: blöfü yakalarsa +10 (blöfçü -10), haksız çıkarsa -10.");
});
document.getElementById("btn-menu").addEventListener("click", () => {
  if (confirm("Oyundan çıkıp menüye dönülsün mü?")) {
    stopTimer();
    game = null; // sürmekte olan yapay zekâ turu durur
    busy = false;
    gameScreen.style.display = "none";
    menuScreen.style.display = "block";
  }
});

// ---------------- Kartlar ----------------
function buildCards() {
  const grid = document.getElementById("card-grid");
  grid.innerHTML = "";
  CARDS.forEach((card) => {
    const b = document.createElement("button");
    b.className = "card-tile";
    b.textContent = card.title;
    b.addEventListener("click", () => openCard(card));
    grid.appendChild(b);
  });
}
// **kalın** işaretini güvenli biçimde (innerHTML kullanmadan) kalın yazıya çevirir
function richText(el, str) {
  str.split("**").forEach((part, i) => {
    if (!part) return;
    if (i % 2) {
      const b = document.createElement("strong");
      b.textContent = part;
      el.appendChild(b);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  });
}

function buildCardFace(face, color) {
  const box = document.createElement("div");
  box.className = "card-face";
  if (color) box.style.setProperty("--cc", color);
  const label = document.createElement("div");
  label.className = "card-label";
  label.textContent = face.label;
  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = face.title;
  box.append(label, title);
  if (face.sub) {
    const sub = document.createElement("div");
    sub.className = "card-sub";
    sub.textContent = face.sub;
    box.appendChild(sub);
  }
  face.sections.forEach((sec) => {
    const wrap = document.createElement("div");
    wrap.className = "card-sec";
    const h = document.createElement("div");
    h.className = "card-h";
    h.textContent = sec.h;
    wrap.appendChild(h);
    if (sec.p) {
      const p = document.createElement("p");
      richText(p, sec.p);
      wrap.appendChild(p);
    }
    if (sec.list) {
      const ul = document.createElement("ul");
      sec.list.forEach((t) => {
        const li = document.createElement("li");
        richText(li, t);
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }
    box.appendChild(wrap);
  });
  return box;
}

function openCard(card) {
  modalTitle.textContent = card.title;
  modalBody.textContent = "";
  if (card.front && card.back) {
    const tabs = document.createElement("div");
    tabs.className = "card-tabs";
    const faces = [["Ön yüz", card.front], ["Arka yüz", card.back]];
    const holder = document.createElement("div");
    const show = (k) => {
      holder.innerHTML = "";
      holder.appendChild(buildCardFace(faces[k][1], card.color));
      Array.from(tabs.children).forEach((t, j) => t.classList.toggle("active", j === k));
    };
    faces.forEach(([name], k) => {
      const t = document.createElement("button");
      t.className = "card-tab";
      t.textContent = name;
      t.addEventListener("click", () => show(k));
      tabs.appendChild(t);
    });
    modalBody.append(tabs, holder);
    show(0);
  } else {
    if (card.image) {
      const img = document.createElement("img");
      img.src = card.image;
      img.alt = card.title;
      img.className = "card-img";
      modalBody.appendChild(img);
    }
    if (card.text) modalBody.appendChild(document.createTextNode(card.text));
    if (!card.image && !card.text) modalBody.textContent = "Bu kartın içeriği yakında eklenecek.";
  }
  modalOverlay.style.display = "flex";
}
buildCards();
document.getElementById("btn-cards").addEventListener("click", () => {
  menuScreen.style.display = "none";
  cardsScreen.style.display = "block";
});
document.getElementById("btn-cards-back").addEventListener("click", () => {
  cardsScreen.style.display = "none";
  menuScreen.style.display = "block";
});

// ---------------- Oyun başlangıcı ----------------
function startGame(level, names, opts = {}) {
  game = new Game(level, names, opts);
  finalTime = null;
  startTime = Date.now();
  sel = null;
  busy = false;
  traySig = "";
  menuScreen.style.display = "none";
  gameScreen.style.display = "block";
  buildGameUI();
  stopTimer();
  if (level === 1) tick();
  say(level === 1
    ? "Bir test aracını sürükleyip kareye bırak."
    : "Sırayla oynayın. Bir test aracını sürükleyip kareye bırak.");
  lblInfo.textContent = "";
  if (level === 1) { refresh(); updateActions(); }
  else beginTurn();
}

function buildGameUI() {
  boardGrid.innerHTML = "";
  cellEls = [];
  const n = game.size;
  const px = n >= 7 ? 62 : n >= 5 ? 74 : 90;
  boardGrid.style.setProperty("--n", n);
  boardGrid.style.setProperty("--cs-max", `${px}px`);
  for (let i = 0; i < game.cellCount; i++) {
    const c = document.createElement("div");
    c.className = "cell";
    c.dataset.i = i;
    c.tabIndex = 0;
    c.setAttribute("role", "button");
    c.addEventListener("click", () => onCell(i));
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCell(i); }
    });
    boardGrid.appendChild(c);
    cellEls.push(c);
  }
}

// ---------------- Görsel öğeler ----------------
function playerStyle(p) { return PLAYER_STYLES[p % PLAYER_STYLES.length]; }

// Taşın rengi malzemeyi gösterir (N kırmızı, S mavi, Fe gri, Cu turuncu).
// Çok oyunculu oyunda hangi oyuncunun olduğu köşedeki renkli şekil rozetiyle anlaşılır.
function makeStone(sym, p) {
  const st = document.createElement("div");
  st.className = `stone stone-${sym}`;
  const letter = document.createElement("span");
  letter.className = "stone-letter";
  letter.textContent = sym;
  st.appendChild(letter);
  if (game && game.level === 2) {
    const mark = document.createElement("span");
    mark.className = "stone-mark";
    mark.style.setProperty("--pl", playerStyle(p).color);
    mark.textContent = playerStyle(p).mark;
    st.appendChild(mark);
  }
  return st;
}

function makePawn(tool) {
  const pawn = document.createElement("div");
  pawn.className = `pawn pawn-${tool}`;
  const fig = document.createElement("div");
  fig.className = "pawn-fig";
  const head = document.createElement("span");
  head.className = "p-head";
  const body = document.createElement("span");
  body.className = "p-body";
  body.textContent = tool;
  const base = document.createElement("span");
  base.className = "p-base"; // altı kare
  fig.append(head, body, base);
  pawn.appendChild(fig);
  return pawn;
}

// ---------------- Tepsi: sürükle-bırak ve seçme ----------------
function whyBlocked() {
  if (!game || game.over) return "Oyun bitti.";
  if (busy) return "Bir saniye...";
  if (game.phase === "ai") return "Sıra yapay zekâda.";
  if (game.phase === "challenge") return "Önce itiraz et ya da kabul et.";
  if (game.phase === "reveal" || game.phase === "announce") return "Önce testin sonucunu açıkla.";
  return "";
}
function canAct() { return whyBlocked() === ""; }

function toggleSelect(kind, value) {
  const why = whyBlocked();
  if (why) return say(why);
  if (sel && sel.kind === kind && sel.value === value) sel = null;
  else sel = { kind, value };
  renderTray();
  if (sel) say(kind === "tool"
    ? `${TOOL_NAMES[value]} seçildi. Şimdi bir kareye dokun.`
    : `${value} taşı seçildi. Şimdi bir kareye dokun.`);
}

function wireTrayItem(el, kind, value) {
  let start = null, ghost = null, dragging = false;
  const cleanup = () => {
    el.classList.remove("dragging");
    if (ghost) { ghost.remove(); ghost = null; }
    boardGrid.querySelectorAll(".hover").forEach((c) => c.classList.remove("hover"));
    start = null;
    dragging = false;
  };
  el.addEventListener("pointerdown", (e) => {
    if (!canAct()) { say(whyBlocked()); return; }
    start = { x: e.clientX, y: e.clientY };
    dragging = false;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* yoksay */ }
    e.preventDefault();
  });
  el.addEventListener("pointermove", (e) => {
    if (!start) return;
    if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
      dragging = true;
      ghost = kind === "tool" ? makePawn(value) : makeStone(value, game.current);
      ghost.classList.add("ghost");
      document.body.appendChild(ghost);
      el.classList.add("dragging");
    }
    if (dragging) {
      ghost.style.left = e.clientX + "px";
      ghost.style.top = e.clientY + "px";
      boardGrid.querySelectorAll(".hover").forEach((c) => c.classList.remove("hover"));
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const cell = under && under.closest(".cell");
      if (cell) cell.classList.add("hover");
    }
  });
  el.addEventListener("pointerup", (e) => {
    if (!start) return;
    const wasDrag = dragging;
    let cellIdx = null;
    if (wasDrag) {
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const cell = under && under.closest(".cell");
      if (cell) cellIdx = parseInt(cell.dataset.i, 10);
    }
    cleanup();
    if (wasDrag) { if (cellIdx !== null) useItem({ kind, value }, cellIdx); }
    else toggleSelect(kind, value);
  });
  el.addEventListener("pointercancel", cleanup);
}

function renderTray() {
  if (!game) return;
  const p = game.current;
  const sig = [p, game.phase, game.level, sel && sel.kind + sel.value, busy ? 1 : 0,
    MATERIALS.map((m) => game.stonesLeft(p, m)).join(",")].join("|");
  if (sig === traySig) return;
  traySig = sig;
  stoneTray.innerHTML = "";
  toolTray.innerHTML = "";
  MATERIALS.forEach((sym) => {
    const wrap = document.createElement("div");
    wrap.className = "tray-item";
    if (sel && sel.kind === "stone" && sel.value === sym) wrap.classList.add("selected");
    const left = game.stonesLeft(p, sym);
    if (left <= 0) wrap.classList.add("empty");
    wrap.appendChild(makeStone(sym, p));
    const cnt = document.createElement("div");
    cnt.className = "tray-count";
    cnt.textContent = `×${left}`;
    wrap.appendChild(cnt);
    if (left > 0) wireTrayItem(wrap, "stone", sym);
    stoneTray.appendChild(wrap);
  });
  TOOLS.forEach((tool) => {
    const wrap = document.createElement("div");
    wrap.className = "tray-item tool-item";
    if (sel && sel.kind === "tool" && sel.value === tool) wrap.classList.add("selected");
    wrap.dataset.tool = tool;
    wrap.appendChild(makePawn(tool));
    const cnt = document.createElement("div");
    cnt.className = "tray-count";
    cnt.textContent = TOOL_NAMES[tool];
    wrap.appendChild(cnt);
    wireTrayItem(wrap, "tool", tool);
    toolTray.appendChild(wrap);
  });
}

// ---------------- Eylemler ----------------
function onCell(i) {
  if (!game || game.over) return;
  const here = game.flags.get(i);
  // Seviye 1: bırakılmış taşa dokunmak onu geri alır (başka bir taş seçiliyse yerine konur)
  if (canAct() && game.level === 1 && here && (!sel || sel.kind === "stone" && sel.value === here.sym)) {
    pickUpStone(i);
    return;
  }
  if (sel) { useItem(sel, i); return; }
  if (!canAct()) return say(whyBlocked());
  if (game.level === 2 && game.flags.has(i)) return say("Bu kare kilitli.");
  say("Önce bir test aracı ya da tespit taşı seç (veya sürükleyip bırak).");
}

function useItem(item, i) {
  if (item.kind === "tool") useTool(i, item.value);
  else placeStone(i, item.value);
}

function pickUpStone(i) {
  const { sym } = game.flags.get(i);
  game.flags.delete(i);
  sel = { kind: "stone", value: sym };
  say(`${cellName(i, game.size)} karesindeki ${sym} taşı alındı. Başka bir kareye bırakabilirsin.`);
  refresh();
}

async function useTool(i, tool) {
  const why = whyBlocked();
  if (why) return say(why);
  if (game.level === 2) {
    if (game.forced) return say("Zorunlu tespit turunda test yapılmaz; bir taş yerleştirmelisin.");
    if (game.flags.has(i)) return say("Bu kare kilitli, test gerekmez.");
    if (game.testedThisTurn) return say("Bu turda zaten test yaptın. Taş yerleştir veya turu bitir.");
  }
  sel = null;
  const g = game;
  const real = react(tool, g.board[i]);
  busy = true;
  refresh();
  await animateTool(i, tool, g.bluff ? null : real);
  if (g !== game) return;
  busy = false;
  finishTest(g, i, tool, real);
}

// Test sonrası ortak adım (insan ve yapay zekâ için)
function finishTest(g, i, tool, real) {
  g.testedThisTurn = true;
  g.testCount++;
  const p = g.current;
  if (!g.bluff) {
    g.record(i, p, tool, real, real);
    const who = g.level === 2 ? `${g.players[p]} - ` : "";
    say(`${who}${cellName(i, g.size)} karesi, ${TOOL_NAMES[tool]}:\n${REACTION_TEXT[real]}`);
    refresh();
    if (g.level === 1 && g.expert && g.testCount > EXPERT_FREE_TESTS) {
      say(lblMsg.textContent + `\n(Ücretsiz ${EXPERT_FREE_TESTS} test aşıldı: −1 puan)`);
    }
    autoEndTurn();
    return;
  }
  g.pending = { cell: i, tool, real };
  if (g.ai === p) return; // yapay zekâ kendi açıklamasını kendi verir
  g.phase = g.ai >= 0 ? "announce" : "reveal";
  refresh();
  updateActions();
}

function announce(said) {
  const g = game;
  const { cell, tool, real } = g.pending;
  const p = g.current;
  const entry = g.record(cell, p, tool, real, said);
  g.pending = null;
  g.claim = { cell, tool, said, real, bluffed: said !== real, player: p, entry };
  g.phase = "play";
  say(`${g.players[p]} açıkladı: ${cellName(cell, g.size)} karesi, ${TOOL_NAMES[tool]}:\n${REACTION_TEXT[said]}`);
  refresh();
  updateActions();
  autoEndTurn();
}

function placeStone(i, sym) {
  const why = whyBlocked();
  if (why) return say(why);
  const g = game;
  const p = g.current;
  if (g.level === 2) {
    if (g.flaggedThisTurn) return say("Bu turda zaten taş koydun.");
    if (g.flags.has(i)) return say("Bu kare kilitli, taş konamaz.");
  } else if (g.flags.has(i) && g.flags.get(i).sym === sym) {
    return say("Bu karede zaten bu taş var.");
  }
  const replaced = g.level === 1 ? g.flags.get(i) : null;
  if (g.stonesLeft(p, sym) <= 0 && !(replaced && replaced.sym === sym)) {
    return say(`${sym} taşların bitti. Bir taşı geri almak için karesine dokun.`);
  }
  commitStone(g, i, sym);
  if (g.level === 2) sel = null;
  if (g.allFlagged()) { refresh(); finish(); return; }
  autoEndTurn();
}

function commitStone(g, i, sym) {
  g.flags.set(i, { player: g.current, sym });
  g.flaggedThisTurn = true;
  g.justPlaced = i;
  say(`${cellName(i, g.size)} karesine ${sym} taşı bırakıldı.`);
  refresh();
  g.justPlaced = null;
}

function autoEndTurn() {
  const g = game;
  if (g.level !== 2 || g.over || g.ai === g.current) return;
  if (g.phase !== "play") return;
  if ((g.testedThisTurn || g.forced) && g.flaggedThisTurn) {
    busy = true;
    refresh();
    setTimeout(() => {
      if (g !== game) return;
      busy = false;
      endTurn();
    }, 750);
  } else {
    updateActions();
  }
}

function endTurn() {
  const g = game;
  if (g.over) return;
  if (!g.flaggedThisTurn) g.passStreak++;
  else g.passStreak = 0;
  if (!g.forced && g.passStreak >= PASS_ROUNDS_FOR_FORCED * g.players.length) {
    g.forced = true;
    showModal("Zorunlu Tespit Turu",
      "Herkes art arda iki tam tur pas geçti.\nŞimdi her oyuncu sırayla bir taş yerleştirmek zorunda; test yapılmaz.");
  }
  g.current = (g.current + 1) % g.players.length;
  g.testedThisTurn = false;
  g.flaggedThisTurn = false;
  sel = null;
  beginTurn();
}

function beginTurn() {
  const g = game;
  g.phase = "play";
  refresh();
  const claim = g.claim;
  g.claim = null; // itiraz hakkı yalnızca hemen sonraki oyuncuya aittir
  if (g.bluff && claim && claim.player !== g.current && !g.forced) {
    if (g.ai === g.current) {
      const doIt = aiShouldChallenge(g, g.current, claim);
      resolveChallenge(g.current, claim, doIt);
    } else {
      g.phase = "challenge";
      g.pendingClaim = claim;
      updateActions();
      return;
    }
  }
  startPlay();
}

function startPlay() {
  const g = game;
  g.phase = "play";
  refresh();
  updateActions();
  if (g.ai === g.current) aiTurn();
}

function resolveChallenge(challenger, claim, doChallenge) {
  const g = game;
  const tester = g.players[claim.player];
  const me = g.players[challenger];
  const where = `${cellName(claim.cell, g.size)} (${TOOL_NAMES[claim.tool]})`;
  if (!doChallenge) {
    claim.entry.confirmed = false;
    say(`${me} itiraz etmedi.`);
    return;
  }
  if (claim.bluffed) {
    g.bonus[claim.player] -= BLUFF_CAUGHT;
    g.bonus[challenger] += BLUFF_CAUGHT;
    claim.entry.result = claim.real;
    claim.entry.exposed = true;
    say(`🚨 ${me} itiraz etti: ${tester} ${where} testinde BLÖF yapmıştı!\n` +
      `Gerçek tepki: ${REACTION_TEXT[claim.real]}\n${me} +${BLUFF_CAUGHT}, ${tester} −${BLUFF_CAUGHT}.`);
  } else {
    g.bonus[challenger] += BLUFF_FALSE_ALARM;
    claim.entry.confirmed = true;
    say(`${me} itiraz etti ama ${tester} doğruyu söylüyordu (${where}).\n${me} ${BLUFF_FALSE_ALARM}.`);
  }
  refresh();
}

// ---------------- Eylem paneli ----------------
function panelText(text) {
  const d = document.createElement("div");
  d.className = "panel-text";
  d.textContent = text;
  return d;
}
function panelBtn(label, onClick, cls = "") {
  const b = document.createElement("button");
  b.className = "big-btn " + cls;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function updateActions() {
  actionPanel.innerHTML = "";
  const g = game;
  if (!g || g.over) return;
  const p = g.current;
  if (g.phase === "ai") {
    actionPanel.appendChild(panelText("🤖 Yapay zekâ düşünüyor…"));
  } else if (g.phase === "challenge") {
    const c = g.pendingClaim;
    actionPanel.appendChild(panelText(
      `${g.players[c.player]} ${cellName(c.cell, g.size)} karesini ${TOOL_NAMES[c.tool]} ile test etti ve ` +
      `"${REACTION_SHORT[c.said]}" dedi. Blöf yapıyor olabilir mi?`));
    actionPanel.appendChild(panelBtn("🚨 İtiraz et", () => {
      g.pendingClaim = null;
      resolveChallenge(p, c, true);
      startPlay();
    }));
    actionPanel.appendChild(panelBtn("Kabul et", () => {
      g.pendingClaim = null;
      resolveChallenge(p, c, false);
      startPlay();
    }, "alt-btn"));
  } else if (g.phase === "reveal") {
    actionPanel.appendChild(panelText(`🔒 Yalnızca ${g.players[p]} ekrana bakmalı!`));
    actionPanel.appendChild(panelBtn("Tepkiyi göster", () => {
      g.phase = "announce";
      updateActions();
    }));
  } else if (g.phase === "announce") {
    const { cell, real } = g.pending;
    actionPanel.appendChild(panelText(
      `${cellName(cell, g.size)} karesinde gerçek tepki:\n${REACTION_TEXT[real]}\n\nNe açıklıyorsun?`));
    actionPanel.appendChild(panelBtn("✅ Doğruyu söyle", () => announce(real)));
    REACTIONS.filter((r) => r !== real).forEach((r) =>
      actionPanel.appendChild(panelBtn(`🤥 Blöf: "${REACTION_SHORT[r]}" de`, () => announce(r), "alt-btn")));
  } else if (g.level === 2 && g.phase === "play" && g.ai !== p) {
    if (g.forced) {
      actionPanel.appendChild(panelText("Zorunlu tespit turu: bir taş yerleştirmelisin."));
    } else if (g.testedThisTurn && !g.flaggedThisTurn) {
      actionPanel.appendChild(panelBtn("Taş koymadan bitir (Pas)", endTurn, "alt-btn"));
    }
  }
  renderTray();
}

// ---------------- Yapay zekâ turu ----------------
async function aiTurn() {
  const g = game;
  const p = g.current;
  g.phase = "ai";
  refresh();
  updateActions();
  await sleep(900);
  if (g !== game || g.over) return;

  if (!g.forced) {
    const t = aiChooseTest(g, p);
    if (t) {
      const real = react(t.tool, g.board[t.cell]);
      busy = true;
      refresh();
      await animateTool(t.cell, t.tool, g.bluff ? null : real);
      if (g !== game) return;
      busy = false;
      g.testedThisTurn = true;
      g.testCount++;
      if (!g.bluff) {
        g.record(t.cell, p, t.tool, real, real);
        say(`${g.players[p]} - ${cellName(t.cell, g.size)} karesi, ${TOOL_NAMES[t.tool]}:\n${REACTION_TEXT[real]}`);
      } else {
        const said = aiDecideAnnouncement(g, p, t.cell, t.tool, real);
        const entry = g.record(t.cell, p, t.tool, real, said);
        g.claim = { cell: t.cell, tool: t.tool, said, real, bluffed: said !== real, player: p, entry };
        say(`${g.players[p]} açıkladı: ${cellName(t.cell, g.size)} karesi, ${TOOL_NAMES[t.tool]}:\n${REACTION_TEXT[said]}`);
      }
      refresh();
      await sleep(900);
      if (g !== game || g.over) return;
    }
  }

  const f = aiChooseFlag(g, p, g.forced);
  if (f) {
    commitStone(g, f.cell, f.sym);
    if (g.allFlagged()) { finish(); return; }
    await sleep(900);
    if (g !== game || g.over) return;
  }
  endTurn();
}

// ---------------- Animasyonlar ----------------
function animateTool(cell, tool, result) {
  return new Promise((resolve) => {
    const cellEl = cellEls[cell];
    cellEl.classList.add("testing");
    const crect = cellEl.getBoundingClientRect();
    const srcEl = toolTray.querySelector(`[data-tool="${tool}"]`);
    const srect = srcEl ? srcEl.getBoundingClientRect() : crect;
    const pawn = makePawn(tool);
    pawn.classList.add("flying");
    pawn.style.left = srect.left + srect.width / 2 + "px";
    pawn.style.top = srect.top + srect.height / 2 + "px";
    document.body.appendChild(pawn);
    pawn.getBoundingClientRect(); // geçişin başlaması için yeniden akış
    const dur = REDUCED_MOTION ? 0 : 450;
    pawn.style.left = crect.left + crect.width / 2 + "px";
    pawn.style.top = crect.top + crect.height / 2 + "px";
    setTimeout(() => {
      const fig = pawn.querySelector(".pawn-fig");
      fig.classList.add(result ? `react-${result}` : "react-neutral");
      if (result) {
        const bubble = document.createElement("div");
        bubble.className = `bubble bubble-${result}`;
        bubble.textContent = REACTION_BUBBLE[result];
        bubble.style.left = crect.left + crect.width / 2 + "px";
        bubble.style.top = crect.top + "px";
        document.body.appendChild(bubble);
        setTimeout(() => bubble.remove(), REDUCED_MOTION ? 200 : 1300);
      }
      setTimeout(() => {
        pawn.classList.add("leaving");
        cellEl.classList.remove("testing");
        setTimeout(() => { pawn.remove(); resolve(); }, REDUCED_MOTION ? 0 : 250);
      }, REDUCED_MOTION ? 100 : 950);
    }, dur);
  });
}

// ---------------- Süre / ekran ----------------
function say(text) {
  lblMsg.textContent = text;
}

function tick() {
  if (game && game.level === 1 && finalTime === null) {
    refreshTimer();
    timerHandle = setTimeout(tick, 200);
  }
}
function stopTimer() {
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
}
function elapsed() {
  return finalTime !== null ? finalTime : (Date.now() - startTime) / 1000;
}
function refreshTimer() {
  const t = elapsed();
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  let txt = `⏱ Süre: ${String(m).padStart(2, "0")}:${s}`;
  if (game.expert) txt += `\nTest: ${game.testCount} (ücretsiz ${EXPERT_FREE_TESTS})`;
  lblInfo.textContent = txt;
}

function refresh() {
  if (!game) return;
  const g = game;
  lblTitle.textContent = `SEVİYE ${g.level}` +
    (g.expert ? " · UZMAN" : "") + (g.bluff ? " · BLÖF" : "") + (g.ai >= 0 ? " · YZ" : "");
  if (g.level === 1) {
    lblTurn.textContent = "Serbest test - hızlı ol!";
    lblTurn.style.color = "";
    if (!g.over) refreshTimer();
  } else if (g.over) {
    lblTurn.textContent = "Oyun bitti";
    lblTurn.style.color = "";
  } else {
    const st = playerStyle(g.current);
    lblTurn.textContent = `${st.mark} Sıra: ${g.players[g.current]}` +
      (g.forced ? " (Zorunlu Tespit Turu)" : "");
    lblTurn.style.color = st.color;
    if (!g.over) {
      lblInfo.textContent = g.forced
        ? "Bu tur: taş yerleştirmek zorundasın"
        : `Bu tur: test ${g.testedThisTurn ? "✔" : "–"}   taş ${g.flaggedThisTurn ? "✔" : "–"}`;
    }
  }
  cellEls.forEach((el, i) => paintCell(i, el));
  refreshScores();
  renderTray();
}

function paintCell(i, el) {
  const g = game;
  const flag = g.flags.get(i);
  // Her araç için yalnızca bir kez (en son sonucu) gösterilir
  const byTool = new Map();
  (g.tests.get(i) || []).forEach((t) => byTool.set(t.tool, t));
  const hist = chkHistory.checked ? [...byTool.values()] : [];
  const sig = JSON.stringify([
    flag || 0, g.over, g.justPlaced === i,
    hist.map((t) => [t.tool, t.result, t.exposed, t.confirmed]),
  ]);
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.innerHTML = "";
  el.classList.toggle("locked", !!flag && g.level === 2);

  const label = document.createElement("span");
  label.className = "cell-label";
  label.textContent = cellName(i, g.size);
  el.appendChild(label);

  if (flag) {
    const st = makeStone(flag.sym, flag.player);
    if (g.justPlaced === i) st.classList.add("drop");
    if (g.over) st.classList.add(g.board[i] === flag.sym ? "ok" : "bad");
    el.appendChild(st);
    if (g.level === 2 && !g.over) {
      const lock = document.createElement("span");
      lock.className = "cell-lock";
      lock.textContent = "🔒";
      el.appendChild(lock);
    }
  }
  if (g.over) {
    const real = document.createElement("span");
    real.className = "cell-real";
    real.textContent = `Gerçek: ${g.board[i]}`;
    el.appendChild(real);
  } else if (hist.length) {
    const h = document.createElement("span");
    h.className = "cell-hist";
    h.textContent = hist.map((t) =>
      `${t.tool === "Fe" ? "Fe" : "N"}:${REACTION_SHORT[t.result]}${t.exposed ? "🤥" : ""}${t.confirmed ? "✔" : ""}`
    ).join(" ");
    el.appendChild(h);
  }
}

function refreshScores() {
  const g = game;
  const lines = [`Taşlı kare: ${g.flags.size}/${g.cellCount}`];
  if (g.level === 2) {
    g.players.forEach((name, p) => {
      let n = 0;
      for (const { player } of g.flags.values()) if (player === p) n++;
      lines.push(`${playerStyle(p).mark} ${name}: ${n} taş`);
    });
  }
  lblScore.textContent = lines.join("\n");
}

chkHistory.addEventListener("change", () => game && refresh());

// Skor tablosu için isim: oyuncu isterse yazar, istemezse "Oyun 1", "Oyun 2"... diye otomatik gider
function nextAutoName() {
  let n = 0;
  try { n = parseInt(localStorage.getItem("oyunSayaci"), 10) || 0; } catch (e) { /* yoksay */ }
  n++;
  try { localStorage.setItem("oyunSayaci", String(n)); } catch (e) { /* yoksay */ }
  return `Oyun ${n}`;
}

function askScoreName() {
  let saved = "";
  try { saved = localStorage.getItem("oyuncuAdi") || ""; } catch (e) { /* yoksay */ }
  if (confirm("Skor tablosuna isim girmek ister misin?\n\n(İstemezsen skorun 'Oyun 1', 'Oyun 2' gibi otomatik bir adla kaydedilir.)")) {
    const name = (prompt("Adını yaz:", saved) || "").trim().slice(0, 20);
    if (name) {
      try { localStorage.setItem("oyuncuAdi", name); } catch (e) { /* yoksay */ }
      return name;
    }
  }
  return nextAutoName();
}

function finish() {
  const g = game;
  g.over = true;
  g.phase = "over";
  sel = null;
  busy = false;
  stopTimer();
  finalTime = (Date.now() - startTime) / 1000;
  refresh();
  updateActions();
  const s = g.scores();
  let correct = 0;
  for (const [cell, { sym }] of g.flags.entries()) {
    if (g.board[cell] === sym) correct++;
  }
  let msg;
  if (g.level === 1) {
    refreshTimer();
    msg = `Doğru: ${correct}/${g.cellCount}\nSüre: ${finalTime.toFixed(1)} sn\nPUAN: ${s[0]}`;
  } else {
    const order = s.map((_, p) => p).sort((a, b2) => s[b2] - s[a]);
    msg = order.map((p, k) => `${k + 1}. ${g.players[p]}: ${s[p]} puan`).join("\n");
    msg += `\n\nKazanan: ${g.players[order[0]]}`;
    if (order.length > 1 && s[order[0]] === s[order[1]]) msg += " (beraberlik!)";
  }
  say("OYUN BİTTİ!\n" + msg);
  showModal("Oyun bitti - Showdown", msg);
  if (g.level === 1) {
    const name = askScoreName();
    saveScore(name, s[0], correct, finalTime).then((ok) =>
      showModal("Oyun bitti - Showdown",
        msg + (ok ? `\n\n✅ Skorun "${name}" adıyla kaydedildi.` : "\n\n⚠️ Skor kaydedilemedi.")));
  }
  lblInfo.textContent = "Oyun bitti. Menüye dönüp tekrar oynayabilirsin.";
}

// ---------------- Tam ekran kısayolları ----------------
document.addEventListener("keydown", (e) => {
  if (e.key === "F11") {
    e.preventDefault();
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  } else if (e.key === "Escape" && document.fullscreenElement) {
    document.exitFullscreen();
  }
});
