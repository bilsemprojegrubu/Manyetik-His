"use strict";

// ----------------------------------------------------------------------------
// ÇEVRİMİÇİ MOD (Supabase)
// Hesap + yönetici onayı + odalar + sunucu yetkili oyun. Sunucu tarafı:
// supabase/01_cevrimici_oyun.sql. Tarayıcı yalnızca RPC fonksiyonlarını çağırır;
// gizli tahta ve oyun kuralları sunucuda kalır.
// ----------------------------------------------------------------------------
const OL_DOMAIN = "oyuncu.manyetik.invalid";
const OL_TR = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
const OL_POLL_LOBBY = 2000;
const OL_POLL_GAME = 1200;

// "Şükrü Öz" -> "sukru.oz"
function olNormalizeUsername(raw) {
  return String(raw).trim().replace(/İ/g, "i").replace(/I/g, "i").toLowerCase()
    .replace(/[çğıöşü]/g, (ch) => OL_TR[ch] || ch)
    .replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
}
function olToEmail(username) { return `${olNormalizeUsername(username)}@${OL_DOMAIN}`; }

function olErrorText(msg) {
  const m = String(msg || "");
  if (/Invalid login credentials/i.test(m)) return "Kullanıcı adı ya da şifre hatalı.";
  if (/already registered|already been registered/i.test(m)) return "Bu kullanıcı adı alınmış, başka bir tane dene.";
  if (/at least 6 characters|weak/i.test(m)) return "Şifre en az 6 karakter olmalı.";
  if (/Email not confirmed/i.test(m)) return "Hesap onaylanmamış görünüyor. Yönetici Supabase'de 'Confirm email' ayarını kapatmalı.";
  if (/JWT|expired|not authenticated/i.test(m)) return "Oturumun süresi dolmuş, tekrar giriş yap.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "İnternet bağlantısı yok ya da sunucuya ulaşılamıyor.";
  if (/Could not find the function|schema cache/i.test(m)) return "Sunucu kurulumu eksik: supabase/01_cevrimici_oyun.sql dosyası çalıştırılmamış.";
  return m;
}

let olClient = null;
function olSupa() {
  if (window.__MH_SUPA__) return window.__MH_SUPA__; // yalnızca testler için
  if (!olClient) {
    if (!window.supabase) throw new Error("Çevrimiçi kütüphane yüklenemedi. Sayfayı yenile.");
    olClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return olClient;
}

async function olRpc(fn, args) {
  const { data, error } = await olSupa().rpc(fn, args || {});
  if (error) throw new Error(olErrorText(error.message || String(error)));
  return data;
}

// ---------------- Durum ----------------
const ol = {
  view: "loading",     // loading | auth | pending | home | room | admin
  profile: null,
  rooms: [],
  room: null,
  notice: "",
  error: "",
  working: false,
  authTab: "giris",
  adminTab: "bekleyen",
  adminUsers: [],
  adminCodes: [],
  pollGen: 0,
  pollTimer: null,
  lastEventId: 0,
  eventChain: Promise.resolve(),
  overShown: false,
  joinCode: "",        // bağlantıdaki ?oda=KOD
  inviteCode: "",      // bağlantıdaki ?kod=KOD
};

const olScreen = document.getElementById("online-screen");
const olBody = document.getElementById("online-body");

function olEl(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "value") e.value = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  kids.flat().forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    e.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  });
  return e;
}

// olBody'ye düğümleri ekler; diziler düzleştirilir, boş değerler atlanır
function olAdd(...items) {
  items.flat(Infinity).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    olBody.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  });
}

function olSetScreens(which) {
  menuScreen.style.display = which === "menu" ? "block" : "none";
  gameScreen.style.display = which === "game" ? "block" : "none";
  cardsScreen.style.display = "none";
  olScreen.style.display = which === "online" ? "block" : "none";
}

function olShow(view) {
  ol.view = view;
  olSetScreens("online");
  olRender();
}

// Bir eylemi çalıştırır: hata olursa ekranda gösterir.
async function olDo(fn) {
  if (ol.working) return;
  ol.working = true;
  ol.error = "";
  ol.notice = "";
  olRender();
  try { await fn(); } catch (e) { ol.error = e.message || String(e); }
  ol.working = false;
  if (olScreen.style.display !== "none") olRender();
}

// ---------------- Açılış ----------------
async function openOnline() {
  olSetScreens("online");
  ol.view = "loading";
  olRender();
  try {
    const { data } = await olSupa().auth.getSession();
    if (!data || !data.session) { olShow("auth"); return; }
    await olLoadProfile();
  } catch (e) {
    ol.error = e.message || String(e);
    olShow("auth");
  }
}

async function olLoadProfile() {
  const p = await olRpc("ben");
  if (!p) {
    await olSupa().auth.signOut();
    ol.profile = null;
    ol.error = "Hesap profili bulunamadı. Tekrar kayıt ol ya da yöneticiye haber ver.";
    olShow("auth");
    return;
  }
  ol.profile = p;
  if (!p.onayli) { olShow("pending"); return; }
  ol.rooms = await olRpc("odalarim");
  olShow("home");
  if (ol.joinCode) {            // arkadaş bağlantısıyla geldiyse odaya katıl
    const code = ol.joinCode;
    ol.joinCode = "";
    olDo(() => olJoin(code));
  }
}

// ---------------- Görünümler ----------------
function olRender() {
  olBody.innerHTML = "";
  if (ol.view === "loading") { olBody.appendChild(olEl("p", { class: "ol-muted" }, "Yükleniyor…")); return; }
  const status = [];
  if (ol.error) status.push(olEl("div", { class: "ol-err", role: "alert" }, ol.error));
  if (ol.notice) status.push(olEl("div", { class: "ol-ok", role: "status" }, ol.notice));
  status.forEach((s) => olBody.appendChild(s));
  const views = { auth: olViewAuth, pending: olViewPending, home: olViewHome, room: olViewRoom, admin: olViewAdmin };
  (views[ol.view] || olViewAuth)();
}

function olField(label, input) {
  return olEl("label", { class: "ol-field" }, olEl("span", {}, label), input);
}
function olBtn(label, onclick, cls = "") {
  return olEl("button", { type: "button", class: `big-btn ${cls}`, onclick, disabled: ol.working }, label);
}
function olSmallBtn(label, onclick, cls = "") {
  return olEl("button", { type: "button", class: `ol-small ${cls}`, onclick, disabled: ol.working }, label);
}

// --- Giriş / kayıt ---
function olViewAuth() {
  const reg = ol.authTab === "kayit";
  const tabs = olEl("div", { class: "ol-tabs" },
    olEl("button", { type: "button", class: "ol-tab" + (!reg ? " active" : ""), onclick: () => { ol.authTab = "giris"; ol.error = ""; olRender(); } }, "Giriş yap"),
    olEl("button", { type: "button", class: "ol-tab" + (reg ? " active" : ""), onclick: () => { ol.authTab = "kayit"; ol.error = ""; olRender(); } }, "Kayıt ol"));
  const user = olEl("input", { type: "text", autocomplete: "username", maxlength: "30", placeholder: "ör. ayse.yilmaz", required: true });
  const pass = olEl("input", { type: "password", autocomplete: reg ? "new-password" : "current-password", minlength: "6", required: true });
  const name = olEl("input", { type: "text", maxlength: "20", placeholder: "Arkadaşların bunu görür" });
  const code = olEl("input", { type: "text", maxlength: "20", placeholder: "Varsa davet kodun", value: ol.inviteCode });
  const form = olEl("form", { class: "ol-form", onsubmit: (e) => {
    e.preventDefault();
    olDo(() => reg ? olRegister(user.value, pass.value, name.value, code.value) : olLogin(user.value, pass.value));
  } },
    olField("Kullanıcı adı", user),
    olField("Şifre (en az 6 karakter)", pass),
    reg ? olField("Görünen ad", name) : null,
    reg ? olField("Davet kodu (isteğe bağlı)", code) : null,
    olEl("button", { type: "submit", class: "big-btn", disabled: ol.working }, reg ? "Kayıt ol" : "Giriş yap"));
  olAdd(
    olEl("p", { class: "ol-muted" }, reg
      ? "Davet kodun varsa hesabın hemen açılır; yoksa bir yönetici onaylayınca oyuna girersin."
      : "Arkadaşlarınla oyun kurmak için giriş yap."),
    tabs, form);
}

async function olLogin(username, password) {
  const email = olToEmail(username);
  if (!olNormalizeUsername(username)) throw new Error("Kullanıcı adını yaz.");
  const { error } = await olSupa().auth.signInWithPassword({ email, password });
  if (error) throw new Error(olErrorText(error.message));
  await olLoadProfile();
}

async function olRegister(username, password, display, invite) {
  const norm = olNormalizeUsername(username);
  if (norm.length < 3) throw new Error("Kullanıcı adı en az 3 harf/rakam olmalı.");
  const code = (invite || "").trim();
  if (code) {
    const ok = await olRpc("kod_gecerli", { p_kod: code });
    if (!ok) throw new Error("Bu davet kodu geçerli değil, süresi dolmuş ya da kullanım sınırına ulaşmış.");
  }
  const { data, error } = await olSupa().auth.signUp({
    email: olToEmail(norm), password,
    options: { data: { gorunen_ad: (display || "").trim() || norm, davet_kodu: code || undefined } },
  });
  if (error) throw new Error(olErrorText(error.message));
  if (!data || !data.session) {
    throw new Error("Kayıt alındı ama oturum açılmadı. Yönetici Supabase'de 'Confirm email' ayarını kapatmalı.");
  }
  await olLoadProfile();
}

async function olSignOut() {
  olStopPolling();
  try { await olSupa().auth.signOut(); } catch (e) { /* yoksay */ }
  ol.profile = null; ol.room = null;
  olShow("auth");
}

// --- Onay bekleme ---
function olViewPending() {
  olAdd(
    olEl("div", { class: "ol-card ol-center" },
      olEl("div", { class: "ol-big" }, "⏳"),
      olEl("h2", {}, "Onay bekleniyor"),
      olEl("p", {}, `Merhaba ${ol.profile.gorunen_ad}! Hesabın oluşturuldu. Bir yönetici onayladığında oda kurup arkadaşlarınla oynayabilirsin.`),
      olBtn("Onaylandı mı, kontrol et", () => olDo(olLoadProfile)),
      olSmallBtn("Çıkış yap", olSignOut)));
}

// --- Ana sayfa ---
function olViewHome() {
  const blof = olEl("input", { type: "checkbox", id: "ol-blof" });
  const code = olEl("input", { type: "text", maxlength: "5", placeholder: "KOD", class: "ol-code-input", autocapitalize: "characters" });
  const rooms = ol.rooms || [];
  olAdd(
    olEl("div", { class: "ol-hello" },
      `Merhaba, ${ol.profile.gorunen_ad} `,
      ol.profile.rol === "yonetici" ? olEl("span", { class: "ol-badge" }, "Yönetici") : null),
    olEl("div", { class: "ol-card" },
      olEl("h2", {}, "Yeni oda kur"),
      olEl("label", { class: "ol-check" }, blof, " Blöf modu"),
      olBtn("🏠 Oda kur", () => olDo(() => olCreate(blof.checked)))),
    olEl("div", { class: "ol-card" },
      olEl("h2", {}, "Odaya katıl"),
      olEl("p", { class: "ol-muted" }, "Arkadaşının verdiği 5 harflik kodu yaz."),
      code,
      olBtn("Katıl", () => olDo(() => olJoin(code.value)))),
    rooms.length ? olEl("div", { class: "ol-card" },
      olEl("h2", {}, "Odalarım"),
      rooms.map((r) => olEl("div", { class: "ol-row" },
        olEl("div", {}, olEl("strong", {}, r.kod), ` · ${olDurumText(r.durum)} · ${r.oyuncu_sayisi} oyuncu` + (r.blof ? " · blöf" : "")),
        olSmallBtn("Gir", () => olDo(() => olEnter(r.id)))))) : null,
    ol.profile.rol === "yonetici" ? olBtn("🛠 Yönetim paneli", () => olDo(async () => { await olLoadAdmin(); olShow("admin"); }), "alt-btn") : null,
    olSmallBtn("Çıkış yap", olSignOut));
}

function olDurumText(d) { return { bekleme: "bekliyor", oyunda: "oyunda", bitti: "bitti" }[d] || d; }

// --- Oda işlemleri ---
async function olCreate(blof) {
  const room = await olRpc("oda_kur", { p_blof: !!blof });
  olEnterRoomData(room);
}
async function olJoin(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c.length !== 5) throw new Error("Oda kodu 5 karakter olmalı.");
  const room = await olRpc("odaya_katil", { p_kod: c });
  olEnterRoomData(room);
}
async function olEnter(roomId) {
  const room = await olRpc("oda_getir", { p_oda: roomId });
  if (!room || room.yok) throw new Error("Bu oda artık yok.");
  olEnterRoomData(room);
}

function olEnterRoomData(room) {
  ol.room = room;
  ol.overShown = room.durum === "bitti";
  olStartPolling();
  if (room.durum === "oyunda") olApplyRoom(room, false);
  else olShow("room");     // bekleme ya da bitti: oda salonu
}

function olStopPolling() {
  ol.pollGen++;
  if (ol.pollTimer) { clearTimeout(ol.pollTimer); ol.pollTimer = null; }
}

function olStartPolling() {
  olStopPolling();
  const gen = ol.pollGen;
  const tick = async () => {
    if (gen !== ol.pollGen || !ol.room) return;
    try {
      const r = await olRpc("oda_getir", { p_oda: ol.room.id, p_surum: ol.room.surum });
      if (gen !== ol.pollGen) return;
      if (r && r.yok) olRoomGone();
      else if (r && r.degisti !== false) olOnRoom(r);
    } catch (e) { /* geçici ağ hatası: sonraki turda yeniden dener */ }
    if (gen === ol.pollGen) {
      ol.pollTimer = setTimeout(tick, game && game.remote && !game.over ? OL_POLL_GAME : OL_POLL_LOBBY);
    }
  };
  ol.pollTimer = setTimeout(tick, 600);
}

function olRoomGone() {
  olStopPolling();
  ol.room = null;
  if (game && game.remote) { game = null; busy = false; }
  ol.notice = "Oda kapatıldı.";
  olRefreshRooms().then(() => olShow("home"));
}

async function olRefreshRooms() {
  try { ol.rooms = await olRpc("odalarim"); } catch (e) { ol.rooms = []; }
}

function olOnRoom(room) {
  if (ol.room && room.id === ol.room.id && room.surum < ol.room.surum) return; // eski yanıt
  if (room.durum === "bekleme") {
    const wasInGame = game && game.remote;
    ol.room = room;
    if (wasInGame) { game = null; busy = false; ol.overShown = false; }
    if (wasInGame || ol.view === "room") olShow("room");
    return;
  }
  if (room.durum === "bitti" && !(game && game.remote)) {   // salonda bekleyen, sonuçlara atlamasın
    ol.room = room;
    if (ol.view === "room") olRender();
    return;
  }
  olApplyRoom(room, false);
}

// --- Oda bekleme salonu ---
function olViewRoom() {
  const r = ol.room;
  if (!r) { olShow("home"); return; }
  const n = r.oyuncular.length;
  const link = `${location.origin}${location.pathname}?oda=${r.kod}`;
  const list = r.oyuncular.map((o) => olEl("div", { class: "ol-row" },
    olEl("div", {}, o.kurucu ? "👑 " : "", olEl("strong", {}, o.ad), o.id === r.benim.id ? " (sen)" : ""),
    r.kurucu && o.id !== r.benim.id ? olEl("div", { class: "ol-actions" },
      olSmallBtn("Kurucu yap", () => olDo(async () => { await olRpc("oda_kurucu_yap", { p_oda: r.id, p_kullanici: o.id }); olNudge(); })),
      olSmallBtn("Çıkar", () => olDo(async () => { await olRpc("oda_at", { p_oda: r.id, p_kullanici: o.id }); olNudge(); }), "ol-danger")) : null));
  olAdd(
    olEl("div", { class: "ol-card ol-center" },
      olEl("div", { class: "ol-muted" }, "Oda kodu"),
      olEl("div", { class: "ol-code" }, r.kod),
      olEl("div", { class: "ol-actions ol-center-actions" },
        olSmallBtn("Kodu kopyala", () => olCopy(r.kod, "Kod kopyalandı.")),
        olSmallBtn("Bağlantıyı kopyala", () => olCopy(link, "Bağlantı kopyalandı. Arkadaşlarına gönder.")))),
    olEl("div", { class: "ol-card" },
      olEl("h2", {}, `Oyuncular (${n}/8)`),
      list,
      olEl("p", { class: "ol-muted" }, (r.blof ? "Blöf modu açık. " : "Blöf modu kapalı. ") +
        (n > 4 ? `${n} oyuncuda tabla ${n}×${n} olur.` : "2–4 oyuncuda tabla 4×4 olur."))),
    r.durum === "bitti"
      ? olEl("div", { class: "ol-card ol-center" },
          olEl("p", {}, "Oyun bitti."),
          olSmallBtn("Son tahtayı gör", () => olApplyRoom(r, false)),
          r.kurucu ? olBtn("🔁 Yeni oyun için odayı aç", () => olDo(async () => { const x = await olRpc("oda_yeniden", { p_oda: r.id }); ol.room = x; ol.overShown = false; })) :
            olEl("p", { class: "ol-muted" }, "Kurucunun yeni oyunu açması bekleniyor…"))
      : r.kurucu
        ? olBtn(n >= 2 ? "▶ Oyunu başlat" : "Başlamak için en az 2 oyuncu gerekir", () => olDo(async () => {
            const room = await olRpc("oyunu_baslat", { p_oda: r.id });
            olEnterRoomData(room);
          }), n >= 2 ? "" : "alt-btn")
        : olEl("p", { class: "ol-muted ol-center" }, "⏳ Kurucunun oyunu başlatması bekleniyor…"),
    olSmallBtn("Odadan ayrıl", () => olDo(async () => {
      await olRpc("odadan_ayril", { p_oda: r.id });
      olStopPolling(); ol.room = null; await olRefreshRooms(); olShow("home");
    })),
    olSmallBtn("← Ana sayfa (odada kal)", () => { olStopPolling(); ol.room = null; olRefreshRooms().then(() => olShow("home")); }));
}

// Sunucudaki değişikliğin hemen görünmesi için tekrar sorgula
async function olNudge() {
  if (!ol.room) return;
  try {
    const r = await olRpc("oda_getir", { p_oda: ol.room.id });
    if (r && !r.yok) { ol.room = r; if (ol.view === "room") olRender(); }
  } catch (e) { /* yoksay */ }
}

async function olCopy(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    ol.error = ""; ol.notice = okMsg;
    olRender();
  } catch (e) {
    window.prompt("Kopyala:", text);
  }
}

// --- Yönetim paneli ---
async function olLoadAdmin() {
  ol.adminUsers = await olRpc("admin_kullanicilar");
  ol.adminCodes = await olRpc("admin_kodlar");
}

function olViewAdmin() {
  const tabs = [["bekleyen", "Onay bekleyenler"], ["kullanici", "Kullanıcılar"], ["kod", "Davet kodları"]];
  const bekleyen = ol.adminUsers.filter((u) => !u.onayli);
  olAdd(
    olEl("div", { class: "ol-tabs" }, tabs.map(([k, label]) =>
      olEl("button", { type: "button", class: "ol-tab" + (ol.adminTab === k ? " active" : ""),
        onclick: () => { ol.adminTab = k; ol.error = ""; ol.notice = ""; olRender(); } },
        label + (k === "bekleyen" && bekleyen.length ? ` (${bekleyen.length})` : "")))));
  const reload = async (fn) => { await fn(); await olLoadAdmin(); };
  if (ol.adminTab === "bekleyen") {
    olAdd(bekleyen.length ? bekleyen.map((u) => olEl("div", { class: "ol-row" },
      olEl("div", {}, olEl("strong", {}, u.gorunen_ad), olEl("div", { class: "ol-muted" }, `Giriş adı: ${u.giris}`)),
      olEl("div", { class: "ol-actions" },
        olSmallBtn("✅ Onayla", () => olDo(() => reload(() => olRpc("admin_onayla", { p_id: u.id, p_onayli: true })))),
        olSmallBtn("Reddet", () => { if (confirm(`${u.gorunen_ad} başvurusu silinsin mi?`)) olDo(() => reload(() => olRpc("admin_sil", { p_id: u.id }))); }, "ol-danger"))))
      : olEl("p", { class: "ol-muted" }, "Onay bekleyen kimse yok."));
  } else if (ol.adminTab === "kullanici") {
    olAdd(ol.adminUsers.filter((u) => u.onayli).map((u) => olEl("div", { class: "ol-row" },
      olEl("div", {}, olEl("strong", {}, u.gorunen_ad), " ",
        u.rol === "yonetici" ? olEl("span", { class: "ol-badge" }, "Yönetici") : null,
        olEl("div", { class: "ol-muted" }, `Giriş adı: ${u.giris}`)),
      u.id === ol.profile.id ? olEl("span", { class: "ol-muted" }, "(sen)") : olEl("div", { class: "ol-actions" },
        u.rol === "yonetici"
          ? olSmallBtn("Yöneticilikten al", () => olDo(() => reload(() => olRpc("admin_rol", { p_id: u.id, p_rol: "ogrenci" }))))
          : olSmallBtn("⭐ Yönetici yap", () => olDo(() => reload(() => olRpc("admin_rol", { p_id: u.id, p_rol: "yonetici" })))),
        olSmallBtn("Onayı kaldır", () => olDo(() => reload(() => olRpc("admin_onayla", { p_id: u.id, p_onayli: false })))),
        olSmallBtn("Sil", () => { if (confirm(`${u.gorunen_ad} hesabı silinsin mi?`)) olDo(() => reload(() => olRpc("admin_sil", { p_id: u.id }))); }, "ol-danger")))));
  } else {
    const code = olEl("input", { type: "text", maxlength: "20", placeholder: "KOD (en az 4 karakter)", value: olRandomCode() });
    const max = olEl("input", { type: "number", min: "1", placeholder: "En çok kaç kişi? (boş = sınırsız)" });
    const days = olEl("input", { type: "number", min: "1", placeholder: "Kaç gün geçerli? (boş = süresiz)" });
    olAdd(
      olEl("div", { class: "ol-card" },
        olEl("h2", {}, "Yeni davet kodu"),
        olEl("p", { class: "ol-muted" }, "Bu kodla kayıt olanlar yönetici onayı beklemeden hemen oynayabilir."),
        olField("Kod", code), olField("Kullanım sınırı", max), olField("Geçerlilik (gün)", days),
        olBtn("Kodu oluştur", () => olDo(() => reload(() => olRpc("admin_kod_olustur", {
          p_kod: code.value, p_max: max.value ? parseInt(max.value, 10) : null, p_gun: days.value ? parseInt(days.value, 10) : null }))))),
      ol.adminCodes.map((c) => {
        const link = `${location.origin}${location.pathname}?kod=${encodeURIComponent(c.kod)}`;
        return olEl("div", { class: "ol-row" },
          olEl("div", {}, olEl("strong", {}, c.kod), c.aktif ? "" : " (kapalı)",
            olEl("div", { class: "ol-muted" }, `${c.kullanilan}${c.max_kullanim ? "/" + c.max_kullanim : ""} kullanım` +
              (c.bitis ? ` · ${new Date(c.bitis).toLocaleDateString("tr-TR")} tarihine kadar` : ""))),
          olEl("div", { class: "ol-actions" },
            olSmallBtn("Bağlantıyı kopyala", () => olCopy(link, "Davet bağlantısı kopyalandı.")),
            c.aktif ? olSmallBtn("Kapat", () => olDo(() => reload(() => olRpc("admin_kod_kapat", { p_kod: c.kod }))), "ol-danger") : null));
      }));
  }
  olAdd(olSmallBtn("← Ana sayfa", () => olShow("home")));
}

function olRandomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => chars[v % chars.length]).join("");
}

// ----------------------------------------------------------------------------
// ÇEVRİMİÇİ OYUN: sunucudaki durumu script.js'in arayüzüne bağlar
// ----------------------------------------------------------------------------
class RemoteGame {
  constructor(room) {
    this.remote = true;
    this.level = 2;
    this.ai = -1;
    this.expert = false;
    this.justPlaced = null;
    this.announceStep = null;
    this.myReal = null;     // blöf modunda: son testimin gerçek tepkisi (yalnızca bende)
    this.apply(room);
  }

  apply(room) {
    const s = room.oyun;
    this.roomId = room.id;
    this.kod = room.kod;
    this.bluff = !!room.blof;
    this.isHost = !!room.kurucu;
    this.me = room.benim.sira;
    this.size = s.boyut;
    this.comp = compositionFor(this.size);
    this.players = s.oyuncular;
    this.flags = new Map();
    for (const [k, v] of Object.entries(s.bayraklar || {})) this.flags.set(parseInt(k, 10), { player: v.o, sym: v.s });
    this.tests = new Map();
    for (const [k, arr] of Object.entries(s.testler || {})) {
      this.tests.set(parseInt(k, 10), arr.map((t) => ({ player: t.o, tool: t.a, result: t.r, exposed: t.ifsa, confirmed: t.onay })));
    }
    this.current = s.sira;
    this.faz = s.faz;
    this.testedThisTurn = !!s.test_yapildi;
    this.flaggedThisTurn = !!s.tas_kondu;
    this.forced = !!s.zorunlu;
    this.over = !!s.bitti;
    this.board = s.tahta || [];
    this.finalScores = s.puanlar || null;
    this.claim = s.itiraz || null;
    this.pending = s.bekleyen || null;
  }

  get cellCount() { return this.size * this.size; }

  get phase() {
    if (this.over) return "over";
    if (this.current !== this.me) return "wait";
    return { oyun: "play", aciklama: "announce", itiraz: "challenge" }[this.faz] || "wait";
  }

  stonesUsed(player, sym) {
    let n = 0;
    for (const f of this.flags.values()) if (f.player === player && f.sym === sym) n++;
    return n;
  }
  stonesLeft(player, sym) { return this.comp[sym] - this.stonesUsed(player, sym); }
  allFlagged() { return this.flags.size === this.cellCount; }
  scores() { return this.finalScores || new Array(this.players.length).fill(0); }
}

function olStartRemoteGame(room) {
  game = new RemoteGame(room);
  ol.room = room;
  sel = null;
  busy = false;
  traySig = "";
  ol.eventChain = Promise.resolve();
  const ev = room.oyun.olay;
  ol.lastEventId = ev ? ev.id : 0;       // eski olayı yeniden oynatma
  stopTimer();
  olSetScreens("game");
  buildGameUI();
  say(room.durum === "bitti" ? "Oyun bitti." : `Çevrimiçi oyun. Sıra: ${game.players[game.current]}.`);
  lblInfo.textContent = "";
  refresh();
  updateActions();
  if (game.phase === "announce") olFetchReal();
  if (room.durum === "bitti" && !ol.overShown) olShowResults(game);
}

// Sunucudan gelen oda durumunu uygular. byMe: bu istemcinin kendi eyleminin yanıtı.
function olApplyRoom(room, byMe) {
  ol.room = room;
  if (!game || !game.remote || game.roomId !== room.id) { olStartRemoteGame(room); return; }
  const g = game;
  const wasForced = g.forced;
  g.apply(room);
  const ev = room.oyun.olay;
  if (ev) {
    if (byMe) {
      ol.lastEventId = Math.max(ol.lastEventId, ev.id);
      say(olEventText(ev, g));
    } else if (ev.id > ol.lastEventId) {
      ol.lastEventId = ev.id;
      olQueueEvent(ev);
    }
  }
  refresh();
  updateActions();
  if (g.phase === "announce" && !g.myReal) olFetchReal();
  if (g.forced && !wasForced) {
    showModal("Zorunlu Tespit Turu",
      "Herkes art arda iki tam tur pas geçti.\nŞimdi her oyuncu sırayla bir taş yerleştirmek zorunda; test yapılmaz.");
  }
  if (g.over && !ol.overShown) olShowResults(g);
}

// Başkalarının hamlelerini sırayla göster (test animasyonu + mesaj)
function olQueueEvent(ev) {
  ol.eventChain = ol.eventChain.then(async () => {
    const g = game;
    if (!g || !g.remote) return;
    if (ev.tur === "test" && ev.oyuncu !== g.me) {
      busy = true;
      refresh();
      try { await animateTool(ev.hucre, ev.arac, ev.sonuc === undefined ? null : ev.sonuc); } catch (e) { /* yoksay */ }
      busy = false;
    }
    if (game === g) {
      say(olEventText(ev, g));
      refresh();
      updateActions();
    }
  }).catch(() => { busy = false; });
}

function olEventText(ev, g) {
  const name = (i) => g.players[i];
  const cell = (c) => cellName(c, g.size);
  switch (ev.tur) {
    case "basla":
      return `Oyun başladı! İlk sıra: ${name(g.current)}.`;
    case "test":
      if (ev.sonuc) return `${name(ev.oyuncu)} - ${cell(ev.hucre)} karesi, ${TOOL_NAMES[ev.arac]}:\n${REACTION_TEXT[ev.sonuc]}`;
      if (ev.oyuncu === g.me && g.myReal) return `${cell(ev.hucre)} karesinde GERÇEK tepki:\n${REACTION_TEXT[g.myReal.real]}`;
      return `${name(ev.oyuncu)}, ${cell(ev.hucre)} karesini ${TOOL_NAMES[ev.arac]} ile test etti. Açıklaması bekleniyor…`;
    case "acikla":
      return `${name(ev.oyuncu)} açıkladı: ${cell(ev.hucre)} karesi, ${TOOL_NAMES[ev.arac]}:\n${REACTION_TEXT[ev.soz]}`;
    case "tas":
      return `${name(ev.oyuncu)}, ${cell(ev.hucre)} karesine ${ev.tas} taşı bıraktı.`;
    case "pas":
      return `${name(ev.oyuncu)} pas geçti.`;
    case "gecildi":
      return `${name(ev.oyuncu)} oyuncusunun sırası kurucu tarafından geçildi.`;
    case "itiraz": {
      const me = name(ev.oyuncu), hedef = name(ev.hedef);
      const where = `${cell(ev.hucre)} (${TOOL_NAMES[ev.arac]})`;
      if (ev.sonuc === "yakalandi") {
        return `🚨 ${me} itiraz etti: ${hedef} ${where} testinde BLÖF yapmıştı!\nGerçek tepki: ${REACTION_TEXT[ev.gercek]}\n${me} +${BLUFF_CAUGHT}, ${hedef} −${BLUFF_CAUGHT}.`;
      }
      if (ev.sonuc === "bos") return `${me} itiraz etti ama ${hedef} doğruyu söylüyordu (${where}).\n${me} ${BLUFF_FALSE_ALARM}.`;
      return `${me} itiraz etmedi.`;
    }
    default:
      return "";
  }
}

function olShowResults(g) {
  ol.overShown = true;
  const s = g.scores();
  const order = s.map((_, p) => p).sort((a, b) => s[b] - s[a]);
  let msg = order.map((p, k) => `${k + 1}. ${g.players[p]}: ${s[p]} puan`).join("\n");
  msg += `\n\nKazanan: ${g.players[order[0]]}`;
  if (order.length > 1 && s[order[0]] === s[order[1]]) msg += " (beraberlik!)";
  msg += "\n\nKurucu, \"Menüye dön\" ile odaya dönüp yeni oyun açabilir.";
  say("OYUN BİTTİ!\n" + s.map((v, p) => `${g.players[p]}: ${v}`).join("\n"));
  lblInfo.textContent = "Oyun bitti.";
  showModal("Oyun bitti - Showdown", msg);
}

// Test ettim ama sayfa yenilendi: gerçek tepkimi sunucudan geri al
async function olFetchReal() {
  const g = game;
  if (!g || !g.remote) return;
  try {
    const r = await olRpc("hamle_ozel", { p_oda: g.roomId });
    if (r && game === g) {
      g.myReal = { hucre: r.hucre, arac: r.arac, real: r.gercek };
      updateActions();
    }
  } catch (e) { /* yoksay */ }
}

// ---------------- Çevrimiçi eylemler ----------------
async function olGameCall(fn, args) {
  const g = game;
  busy = true;
  refresh();
  try {
    const res = await olRpc(fn, { p_oda: g.roomId, ...args });
    busy = false;
    return res;
  } catch (e) {
    busy = false;
    refresh();
    updateActions();
    say(e.message);
    return null;
  }
}

async function remoteUseTool(i, tool) {
  const g = game;
  if (g.forced) return say("Zorunlu tespit turunda test yapılmaz; bir taş yerleştirmelisin.");
  if (g.flags.has(i)) return say("Bu kare kilitli, test gerekmez.");
  if (g.testedThisTurn) return say("Bu turda zaten test yaptın. Taş yerleştir veya turu bitir.");
  sel = null;
  const res = await olGameCall("hamle_test", { p_hucre: i, p_arac: tool });
  if (!res || game !== g) return;
  ol.lastEventId = Math.max(ol.lastEventId, res.oda.oyun.olay.id);
  busy = true;
  // test eden gerçek tepkiyi her durumda görür (blöfte de)
  await animateTool(i, tool, res.sonuc);
  busy = false;
  if (game !== g) return;
  g.myReal = g.bluff ? { hucre: i, arac: tool, real: res.sonuc } : null;
  olApplyRoom(res.oda, true);
}

async function remotePlaceStone(i, sym) {
  const g = game;
  if (g.flaggedThisTurn) return say("Bu turda zaten taş koydun.");
  if (g.flags.has(i)) return say("Bu kare kilitli, taş konamaz.");
  if (g.stonesLeft(g.me, sym) <= 0) return say(`${sym} taşların bitti.`);
  sel = null;
  g.justPlaced = i;
  const res = await olGameCall("hamle_tas", { p_hucre: i, p_sym: sym });
  if (!res || game !== g) { g.justPlaced = null; return; }
  olApplyRoom(res, true);
  g.justPlaced = null;
}

async function remoteAnnounce(said) {
  const g = game;
  const res = await olGameCall("hamle_acikla", { p_soz: said });
  if (!res || game !== g) return;
  g.announceStep = null;
  g.myReal = null;
  olApplyRoom(res, true);
}

async function remoteChallenge(doIt) {
  const g = game;
  const res = await olGameCall("hamle_itiraz", { p_itiraz: doIt });
  if (!res || game !== g) return;
  olApplyRoom(res, true);
}

async function remotePass() {
  const g = game;
  const res = await olGameCall("hamle_pas", {});
  if (!res || game !== g) return;
  olApplyRoom(res, true);
}

async function remoteSkipTurn() {
  if (!confirm("Bu oyuncunun sırası geçilsin mi?")) return;
  const g = game;
  const res = await olGameCall("hamle_sira_gec", {});
  if (!res || game !== g) return;
  olApplyRoom(res, true);
}

function remoteBuildActions(panel) {
  const g = game;
  const add = (node) => panel.appendChild(node);
  if (g.phase === "wait") {
    const who = g.players[g.current];
    const txt = g.faz === "aciklama" ? `⏳ ${who} testin sonucunu açıklıyor…`
      : g.faz === "itiraz" ? `⏳ ${who} itiraz edip etmeyeceğine karar veriyor…`
      : `⏳ Sıra ${who} oyuncusunda.`;
    add(panelText(txt));
    if (g.isHost) add(panelBtn("⏭ Sırayı geç (kurucu)", remoteSkipTurn, "alt-btn"));
    return;
  }
  if (g.phase === "challenge") {
    const c = g.claim;
    if (!c) return;
    add(panelText(
      `${g.players[c.oyuncu]} ${cellName(c.hucre, g.size)} karesini ${TOOL_NAMES[c.arac]} ile test etti ve ` +
      `"${REACTION_SHORT[c.soz]}" dedi. Blöf yapıyor olabilir mi?`));
    add(panelBtn("🚨 Blöf yapıyor! (itiraz et)", () => remoteChallenge(true)));
    add(panelBtn("✅ Doğru söylüyor (kabul et)", () => remoteChallenge(false), "alt-btn"));
    return;
  }
  if (g.phase === "announce") {
    const real = g.myReal && g.myReal.real;
    if (!real) { add(panelText("Gerçek tepki yükleniyor…")); return; }
    const where = `${cellName(g.pending.hucre, g.size)} karesinde`;
    if (g.announceStep === "lie") {
      add(panelText(`Gerçek tepkiyi sen biliyorsun (${REACTION_SHORT[real]}).\nRakiplerine hangi tepkiyi söyleyeceksin?`));
      REACTIONS.filter((r) => r !== real).forEach((r) =>
        add(panelBtn(`🤥 "${REACTION_TEXT[r]}" de`, () => remoteAnnounce(r))));
      add(panelBtn("← Vazgeç", () => { g.announceStep = null; updateActions(); }, "alt-btn"));
    } else {
      add(panelText(`${where} GERÇEK tepki:\n${REACTION_TEXT[real]}\n\nRakiplerine ne söyleyeceksin?`));
      add(panelBtn("✅ Blöf yapma (doğruyu söyle)", () => remoteAnnounce(real)));
      add(panelBtn("🤥 Blöf yap", () => { g.announceStep = "lie"; updateActions(); }, "alt-btn"));
    }
    return;
  }
  // phase === "play": sıra bende
  if (g.forced) add(panelText("Zorunlu tespit turu: bir taş yerleştirmelisin."));
  else if (g.testedThisTurn && !g.flaggedThisTurn) add(panelBtn("Taş koymadan bitir (Pas)", remotePass, "alt-btn"));
  else if (!g.testedThisTurn) add(panelText("Sıra sende! Bir test aracını sürükleyip kareye bırak."));
}

// Oyun ekranından çık: oda açık kalır, odalarım listesinden geri dönülebilir
function remoteLeaveGame() {
  if (!confirm("Oyun ekranından çıkılsın mı? Oda açık kalır, tekrar girebilirsin.")) return;
  olStopPolling();
  game = null;
  busy = false;
  ol.room = null;
  olRefreshRooms().then(() => olShow("home"));
}

// ---------------- Bağlantılar ----------------
document.getElementById("btn-online").addEventListener("click", () => openOnline());
document.getElementById("btn-online-back").addEventListener("click", () => {
  olStopPolling();
  ol.room = null;
  olSetScreens("menu");
});

(function olInitFromUrl() {
  const q = new URLSearchParams(location.search);
  const room = (q.get("oda") || "").trim().toUpperCase();
  const invite = (q.get("kod") || "").trim().toUpperCase();
  if (invite) { ol.inviteCode = invite; ol.authTab = "kayit"; }
  if (room) ol.joinCode = room;
  if (room || invite) openOnline();
})();
