"use strict";

// ----------------------------------------------------------------------------
// AYARLAR
// ----------------------------------------------------------------------------
const SIZE = 4;
const ROWS = "ABCD";
const COMPOSITION = { N: 4, S: 4, Fe: 4, Cu: 4 }; // toplamı 16 olmalı

const L1_CORRECT = 10, L1_WRONG = -5;
const L2_CORRECT = 10, L2_WRONG = -10;

const PLAYER_COLORS = [
  ["Kırmızı", "#e53935"],
  ["Mavi", "#1e88e5"],
  ["Yeşil", "#43a047"],
  ["Sarı", "#f9a825"],
];

// Supabase (skor tablosu). Publishable anahtar tarayıcıda açık durması için üretilmiştir;
// tabloya erişimi veritabanındaki RLS kuralları sınırlar.
const SUPABASE_URL = "https://yetpclbtvqqwktkufsyq.supabase.co";
const SUPABASE_KEY = "sb_publishable_H5FP5r8o4RH3dEtXUe4_UQ_u3tYvIhA";

const TOOL_NAMES = { Fe: "Demir Test Aracı", N: "N-Kutbu Test Aracı" };

const PULL = "cekme", PUSH = "itme", NONE = "yok";
const REACTION_TEXT = {
  [PULL]: "⬇ ÇEKME - taş yuvaya yapıştı",
  [PUSH]: "⬆ İTME - taş havada kaldı, oturmadı",
  [NONE]: "• TEPKİ YOK - taş serbestçe oturdu",
};
const REACTION_SHORT = { [PULL]: "çeker", [PUSH]: "iter", [NONE]: "yok" };

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

function newBoard() {
  const cells = [];
  for (const [m, n] of Object.entries(COMPOSITION)) {
    for (let i = 0; i < n; i++) cells.push(m);
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

function cellName(i) {
  return `${ROWS[Math.floor(i / SIZE)]}${(i % SIZE) + 1}`;
}

class Game {
  constructor(level, playerNames) {
    this.level = level;
    this.board = newBoard();
    this.players = playerNames;
    this.flags = new Map(); // cell -> {player, sym}
    this.tests = new Map(); // cell -> [{player, tool, result}]
    this.correct = level === 1 ? L1_CORRECT : L2_CORRECT;
    this.wrong = level === 1 ? L1_WRONG : L2_WRONG;
    const start = Math.random() < 0.5 ? 0 : 1;
    this.tools = playerNames.map((_, p) => (["Fe", "N"][(start + p) % 2]));
    this.current = 0;
    this.testedThisTurn = false;
    this.flaggedThisTurn = false;
  }

  test(cell, player, tool) {
    const result = react(tool, this.board[cell]);
    if (!this.tests.has(cell)) this.tests.set(cell, []);
    this.tests.get(cell).push({ player, tool, result });
    return result;
  }

  placeFlag(cell, player, sym) {
    if (this.level === 2 && this.flags.has(cell)) return false;
    this.flags.set(cell, { player, sym });
    return true;
  }

  removeFlag(cell) {
    if (this.level === 1) this.flags.delete(cell);
  }

  allFlagged() {
    return this.flags.size === SIZE * SIZE;
  }

  scores() {
    const s = new Array(this.players.length).fill(0);
    for (const [cell, { player, sym }] of this.flags.entries()) {
      s[player] += this.board[cell] === sym ? this.correct : this.wrong;
    }
    return s;
  }
}

// ----------------------------------------------------------------------------
// ARAYÜZ
// ----------------------------------------------------------------------------
const menuScreen = document.getElementById("menu-screen");
const gameScreen = document.getElementById("game-screen");
const nameInputsDiv = document.getElementById("name-inputs");
const boardGrid = document.getElementById("board-grid");
const lblTitle = document.getElementById("lbl-title");
const lblTurn = document.getElementById("lbl-turn");
const lblInfo = document.getElementById("lbl-info");
const lblMsg = document.getElementById("lbl-msg");
const lblScore = document.getElementById("lbl-score");
const toolChoiceDiv = document.getElementById("tool-choice");
const unflagRow = document.getElementById("unflag-row");
const chkHistory = document.getElementById("chk-history");
const btnEndTurn = document.getElementById("btn-end-turn");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");

let game = null;
let cellButtons = [];
let startTime = 0;
let finalTime = null;
let timerHandle = null;
let toolVar = "Fe";

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

function buildNameInputs() {
  nameInputsDiv.innerHTML = "";
  const n = parseInt(document.querySelector('input[name="pcount"]:checked').value, 10);
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "name-input-row";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.textContent = "●";
    dot.style.color = PLAYER_COLORS[i][1];
    const input = document.createElement("input");
    input.type = "text";
    input.value = `Oyuncu ${i + 1}`;
    input.dataset.idx = i;
    row.appendChild(dot);
    row.appendChild(input);
    nameInputsDiv.appendChild(row);
  }
}
document.querySelectorAll('input[name="pcount"]').forEach(r =>
  r.addEventListener("change", buildNameInputs)
);
buildNameInputs();

document.getElementById("btn-level1").addEventListener("click", () => startGame(1, ["Oyuncu"]));
document.getElementById("btn-level2").addEventListener("click", () => {
  const inputs = nameInputsDiv.querySelectorAll("input");
  const names = Array.from(inputs).map((inp, i) => inp.value.trim() || `Oyuncu ${i + 1}`);
  startGame(2, names);
});
document.getElementById("btn-help").addEventListener("click", () => {
  showModal("Nasıl oynanır?",
    "Tablada 16 gizli madde var: N mıknatıs, S mıknatıs, Demir (Fe), Bakır (Cu).\n\n" +
    "Test araçları:\n" +
    " • Demir aracı: mıknatısı ÇEKER (N ve S), Fe ve Cu'ya tepki vermez.\n" +
    " • N aracı: N'yi İTER, S'yi ve Fe'yi ÇEKER, Cu'ya tepki vermez.\n\n" +
    "Tepkilerden maddeyi çıkarıp kareye bayrak dik (N, S, Fe, Cu).\n" +
    "Seviye 1: doğru +10, yanlış -5, en kısa sürede bitir.\n" +
    "Seviye 2: sırayla oynanır; her turda 1 test + 1 bayrak. İlk bayrak kareyi\n" +
    "kilitler. Doğru +10, yanlış -10.");
});
document.getElementById("btn-menu").addEventListener("click", () => {
  if (confirm("Oyundan çıkıp menüye dönülsün mü?")) {
    stopTimer();
    gameScreen.style.display = "none";
    menuScreen.style.display = "block";
  }
});
document.getElementById("btn-end-turn").addEventListener("click", endTurn);

function startGame(level, names) {
  game = new Game(level, names);
  finalTime = null;
  startTime = Date.now();
  toolVar = "Fe";
  document.querySelector('input[name="mode"][value="test"]').checked = true;
  document.querySelector('input[name="flagsym"][value="N"]').checked = true;
  chkHistory.checked = level === 1;

  buildGameUI();
  refresh();
  if (level === 1) tick();

  menuScreen.style.display = "none";
  gameScreen.style.display = "block";
}

function buildGameUI() {
  boardGrid.innerHTML = "";
  cellButtons = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const b = document.createElement("button");
    b.className = "cell-btn";
    b.addEventListener("click", () => onCell(i));
    boardGrid.appendChild(b);
    cellButtons.push(b);
  }

  toolChoiceDiv.innerHTML = "";
  if (game.level === 1) {
    toolChoiceDiv.style.display = "block";
    toolChoiceDiv.innerHTML = `
      <label class="radio-row"><input type="radio" name="toolvar" value="Fe" checked> Demir Test Aracı</label>
      <label class="radio-row"><input type="radio" name="toolvar" value="N"> N-Kutbu Test Aracı</label>`;
    toolChoiceDiv.querySelectorAll('input[name="toolvar"]').forEach(r =>
      r.addEventListener("change", (e) => { toolVar = e.target.value; })
    );
  } else {
    toolChoiceDiv.style.display = "none";
  }

  unflagRow.style.display = game.level === 1 ? "block" : "none";
  btnEndTurn.style.display = game.level === 2 ? "block" : "none";
}

function activeTool() {
  return game.level === 1 ? toolVar : game.tools[game.current];
}

function currentMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function onCell(i) {
  if (game.allFlagged()) return;
  const mode = currentMode();
  if (mode === "test") doTest(i);
  else if (mode === "flag") doFlag(i);
  else if (mode === "unflag") game.removeFlag(i);
  refresh();
  if (game.allFlagged()) finish();
}

function doTest(i) {
  if (game.level === 2) {
    if (game.flags.has(i)) return say("Bu kare kilitli, test gerekmez.");
    if (game.testedThisTurn) return say("Bu turda zaten test yaptın. Bayrak dik veya turu bitir.");
  }
  const tool = activeTool();
  const res = game.test(i, game.current, tool);
  game.testedThisTurn = true;
  const who = game.level === 2 ? `${game.players[game.current]} - ` : "";
  say(`${who}${cellName(i)} karesi, ${TOOL_NAMES[tool]}:\n${REACTION_TEXT[res]}`);
  autoEndTurn();
}

function doFlag(i) {
  const symEl = document.querySelector('input[name="flagsym"]:checked');
  const sym = symEl.value;
  if (game.level === 2) {
    if (game.flaggedThisTurn) return say("Bu turda zaten bayrak diktin. Turu bitir.");
    if (game.flags.has(i)) return say("Bu kare kilitli, bayrak dikilemez.");
  }
  if (game.placeFlag(i, game.current, sym)) {
    game.flaggedThisTurn = true;
    say(`${cellName(i)} karesine ${sym} bayrağı dikildi.`);
    autoEndTurn();
  }
}

function autoEndTurn() {
  if (game.level === 2 && game.testedThisTurn && game.flaggedThisTurn) {
    endTurn();
  }
}

function endTurn() {
  if (game.allFlagged()) return;
  game.current = (game.current + 1) % game.players.length;
  game.testedThisTurn = false;
  game.flaggedThisTurn = false;
  document.querySelector('input[name="mode"][value="test"]').checked = true;
  refresh();
}

function say(text) {
  lblMsg.textContent = text;
}

function tick() {
  if (finalTime === null) {
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
  lblInfo.textContent = `⏱ Süre: ${String(m).padStart(2, "0")}:${s}`;
}

function refresh() {
  if (!game) return;
  lblTitle.textContent = `SEVİYE ${game.level}`;
  if (game.level === 1) {
    lblTurn.textContent = "Serbest test - hızlı ol!";
    lblTurn.style.color = "white";
    refreshTimer();
  } else {
    const [, col] = PLAYER_COLORS[game.current];
    lblTurn.textContent = `● Sıra: ${game.players[game.current]}`;
    lblTurn.style.color = col;
    lblInfo.textContent =
      `Aracın: ${TOOL_NAMES[game.tools[game.current]]}\n` +
      `Bu tur: test ${game.testedThisTurn ? "✔" : "–"}   bayrak ${game.flaggedThisTurn ? "✔" : "–"}`;
  }
  cellButtons.forEach((b, i) => paintCell(i, b));
  refreshScores();
}

function paintCell(i, b) {
  let txt = cellName(i);
  let bg = "#cfd8dc", fg = "black";
  if (game.flags.has(i)) {
    const { player, sym } = game.flags.get(i);
    txt += `\n⚑ ${sym}`;
    bg = PLAYER_COLORS[player][1];
    fg = "white";
    if (game.level === 2) txt += " 🔒";
  }
  if (chkHistory.checked && game.tests.has(i)) {
    const lines = game.tests.get(i).slice(-3).map(({ tool, result }) =>
      `${tool === "Fe" ? "Fe" : "N"}:${REACTION_SHORT[result]}`
    );
    txt += "\n" + lines.join(" ");
  }
  b.textContent = txt;
  b.style.background = bg;
  b.style.color = fg;
}

function refreshScores() {
  const flagged = game.flags.size;
  const lines = [`Bayraklı kare: ${flagged}/16`];
  if (game.level === 2) {
    game.players.forEach((name, p) => {
      let n = 0;
      for (const { player } of game.flags.values()) if (player === p) n++;
      lines.push(`● ${name}: ${n} bayrak`);
    });
  }
  lblScore.textContent = lines.join("\n");
}

chkHistory.addEventListener("change", refresh);

function finish() {
  stopTimer();
  finalTime = (Date.now() - startTime) / 1000;
  cellButtons.forEach((b, i) => {
    const flagEntry = game.flags.get(i);
    const ok = flagEntry && game.board[i] === flagEntry.sym;
    const flagSym = flagEntry ? flagEntry.sym : "-";
    b.textContent = `${cellName(i)}\nGerçek: ${game.board[i]}\nBayrak: ${flagSym}`;
    b.style.background = ok ? "#a5d6a7" : "#ef9a9a";
    b.style.color = "black";
  });
  const s = game.scores();
  let correct = 0;
  for (const [cell, { sym }] of game.flags.entries()) {
    if (game.board[cell] === sym) correct++;
  }
  let msg;
  if (game.level === 1) {
    refreshTimer();
    msg = `Doğru: ${correct}/16\nSüre: ${finalTime.toFixed(1)} sn\nPUAN: ${s[0]}`;
  } else {
    const order = s.map((_, p) => p).sort((a, b2) => s[b2] - s[a]);
    msg = order.map((p, k) => `${k + 1}. ${game.players[p]}: ${s[p]} puan`).join("\n");
    msg += `\n\nKazanan: ${game.players[order[0]]}`;
    if (order.length > 1 && s[order[0]] === s[order[1]]) msg += " (beraberlik!)";
  }
  say("OYUN BİTTİ!\n" + msg);
  showModal("Oyun bitti - Showdown", msg);
  if (game.level === 1) {
    const saved = localStorage.getItem("oyuncuAdi") || "";
    const name = (prompt("Skor tablosuna kaydetmek için adını yaz (iptal = kaydetme):", saved) || "")
      .trim().slice(0, 20);
    if (name) {
      localStorage.setItem("oyuncuAdi", name);
      saveScore(name, s[0], correct, finalTime).then(ok =>
        showModal("Oyun bitti - Showdown",
          msg + (ok ? "\n\n✅ Skorun kaydedildi." : "\n\n⚠️ Skor kaydedilemedi.")));
    }
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
