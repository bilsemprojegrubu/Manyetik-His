// Nasıl oynanır videolarını üretir: oyunu tarayıcıda kendisi oynar, ekranı kaydeder, altyazı ekler.
// Kullanım (Playwright ve ffmpeg gerekir; site "python3 -m http.server 8123" ile açık olmalı):
//   node tools/video_uret.js [tek|uzman|yz|yzblof|cok ...]   → videolar/*.mp4
// Kurallar değişirse bu dosyayı güncelleyip videoları yeniden üretin.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const URL = process.env.SITE || "http://localhost:8123/index.html";
const OUT = path.join(__dirname, "..", "videolar");
const TMP = path.join(process.env.TMPDIR || "/tmp", "mh_video_tmp");
const W = 1100, H = 620;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERLAY = `
(() => {
  const css = document.createElement("style");
  css.textContent = \`
  #vcap{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);max-width:88%;z-index:99999;
    background:rgba(25,12,3,.88);color:#fff6dc;font:700 21px/1.35 Arial,sans-serif;padding:11px 20px;border-radius:12px;
    text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.5);transition:opacity .25s;pointer-events:none}
  #vcap:empty{opacity:0}
  #vcur{position:fixed;width:22px;height:22px;border-radius:50%;background:rgba(255,230,90,.85);border:3px solid #7a4b00;
    z-index:99998;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px;transition:transform .08s}
  #vcur.down{transform:translate(-50%,-50%) scale(.7);background:rgba(255,120,60,.9)}
  #vtitle{position:fixed;inset:0;z-index:100000;background:linear-gradient(160deg,#5e3a1a,#8a5a2b);color:#fff3dc;display:flex;
    flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Arial,sans-serif;padding:30px}
  #vtitle h1{font-size:44px;margin:0 0 14px} #vtitle p{font-size:24px;margin:6px 0;max-width:760px;line-height:1.4}
  \`;
  document.head.appendChild(css);
  const cap = document.createElement("div"); cap.id = "vcap"; document.body.appendChild(cap);
  const cur = document.createElement("div"); cur.id = "vcur"; document.body.appendChild(cur);
  document.addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
  document.addEventListener("mousedown", () => cur.classList.add("down"), true);
  document.addEventListener("mouseup", () => cur.classList.remove("down"), true);
  window.__cap = (t) => { cap.textContent = t || ""; };
  window.__title = (h, lines) => {
    let t = document.getElementById("vtitle");
    if (!h) { if (t) t.remove(); return; }
    if (!t) { t = document.createElement("div"); t.id = "vtitle"; document.body.appendChild(t); }
    t.innerHTML = ""; const e = document.createElement("h1"); e.textContent = h; t.appendChild(e);
    (lines || []).forEach((l) => { const p = document.createElement("p"); p.textContent = l; t.appendChild(p); });
  };
})();`;

class Rec {
  constructor(page) { this.p = page; this.x = 40; this.y = 40; }
  async cap(t, ms = 2500) { await this.p.evaluate((t) => window.__cap(t), t); await wait(ms); }
  async title(h, lines, ms = 3200) {
    await this.p.evaluate(([h, l]) => window.__title(h, l), [h, lines || []]); await wait(ms);
    await this.p.evaluate(() => window.__title(null)); await wait(300);
  }
  async box(sel) {
    const b = await this.p.locator(sel).first().boundingBox();
    if (!b) throw new Error("yok: " + sel);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  async move(x, y, steps = 22) { await this.p.mouse.move(x, y, { steps }); this.x = x; this.y = y; }
  async click(sel, after = 700) {
    const c = await this.box(sel);
    await this.move(c.x, c.y); await wait(250);
    await this.p.mouse.down(); await wait(90); await this.p.mouse.up(); await wait(after);
  }
  async drag(from, to) {
    const a = await this.box(from);
    await this.move(a.x, a.y); await wait(250);
    await this.p.mouse.down(); await wait(120);
    const b = await this.box(to);
    await this.p.mouse.move(b.x, b.y, { steps: 30 }); await wait(250);
    await this.p.mouse.up(); this.x = b.x; this.y = b.y;
  }
  async idle() { // animasyon bitene kadar
    for (let i = 0; i < 80; i++) {
      if (!(await this.p.evaluate(() => busy))) break;
      await wait(150);
    }
    await wait(300);
  }
  cell(i) { return `#board-grid .cell[data-i="${i}"]`; }
  async tool(t, i, bekle = 1400) { await this.drag(`#tool-tray .tray-item:has(.pawn-${t})`, this.cell(i)); await this.idle(); await wait(bekle); }
  async stone(s, i, bekle = 1200) { await this.drag(`#stone-tray .tray-item:has(.stone-${s})`, this.cell(i)); await wait(bekle); }
  async board() { return this.p.evaluate(() => game.board.slice()); }
  async cellOf(m, skip = []) { const b = await this.board(); return b.findIndex((x, i) => x === m && !skip.includes(i)); }
  async closeModal() {
    if (await this.p.evaluate(() => document.getElementById("modal-overlay").style.display !== "none")) {
      await this.click("#modal-close", 400);
    }
  }
  // Sıra bizde (oyuncu 0) ve oynamaya hazır olana kadar bekle; itiraz/pencere çıkarsa işle
  async myTurn(onChallenge) {
    for (let i = 0; i < 200; i++) {
      await this.closeModal();
      const st = await this.p.evaluate(() => ({ cur: game.current, ph: game.phase, busy, over: game.over }));
      if (st.over) return false;
      if (st.ph === "challenge") { if (onChallenge) await onChallenge(); continue; }
      if (st.cur === 0 && st.ph === "play" && !st.busy) return true;
      await wait(250);
    }
    return false;
  }
}

async function kayit(ad, fn) {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, recordVideo: { dir: TMP, size: { width: W, height: H } },
  });
  await ctx.addInitScript(`window.addEventListener("DOMContentLoaded",()=>{${OVERLAY}});`);
  await ctx.addInitScript(() => { try { localStorage.setItem("mh_ses", "0"); } catch (e) {} });
  const page = await ctx.newPage();
  const r = new Rec(page);
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(URL); await wait(800);
  await fn(r, page);
  await wait(600);
  await ctx.close(); await browser.close();
  const webm = fs.readdirSync(TMP).find((f) => f.endsWith(".webm"));
  const hedef = path.join(OUT, ad + ".mp4");
  execSync(`ffmpeg -y -loglevel error -i "${path.join(TMP, webm)}" -vf "scale=960:-2,fps=25" -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart -an "${hedef}"`);
  execSync(`ffmpeg -y -loglevel error -ss 6 -i "${hedef}" -frames:v 1 -q:v 4 "${path.join(OUT, ad + ".jpg")}"`);
  console.log(ad, (fs.statSync(hedef).size / 1e6).toFixed(2) + " MB", errs.length ? "HATA: " + errs.join(" | ") : "hatasız");
}

const SENARYOLAR = {
  // ------------------------------------------------------------------ 1
  async tek(r) {
    await r.title("Tek Oyunculu", ["Zamana karşı: tablodaki 16 gizli kareyi en kısa sürede doğru tespit et."]);
    await r.cap("Ana menüden SEVİYE 1'i seç.", 1500);
    await r.click("#btn-level1", 900);
    await r.cap("Tabloda 16 gizli kare var: 4 N mıknatıs, 4 S mıknatıs, 4 demir (Fe), 4 bakır (Cu).", 3800);
    await r.cap("Süre hemen başlar. Test araçlarını sürükleyip kareye bırakarak maddeyi anlamaya çalış.", 3500);
    const n = await r.cellOf("N");
    await r.cap("N aracı bir karede İTME hissederse orası kesin N mıknatısıdır.", 2200);
    await r.tool("N", n, 1500);
    await r.cap("İtme gördük: kare kesin N. Şimdi N tespit taşını sürükleyip bu kareye bırak.", 2800);
    await r.stone("N", n, 1500);
    const fe = await r.cellOf("Fe");
    await r.cap("Başka bir kare: önce N aracı. ÇEKME var: kare S ya da demir olabilir.", 2500);
    await r.tool("N", fe, 1200);
    await r.cap("Demir aracıyla dene: tepki YOK. Demir mıknatısı çeker ama demire tepki vermez → kare Fe.", 3500);
    await r.tool("Fe", fe, 1200);
    await r.stone("Fe", fe, 1500);
    const s = await r.cellOf("S");
    await r.cap("Bir kare iki araca da ÇEKME veriyorsa: S mıknatıs.", 2200);
    await r.tool("N", s, 1000); await r.tool("Fe", s, 1000);
    await r.stone("S", s, 1500);
    const cu = await r.cellOf("Cu");
    await r.cap("İki araca da tepki yoksa: bakır (Cu).", 2000);
    await r.tool("N", cu, 1000); await r.tool("Fe", cu, 1000);
    await r.stone("Cu", cu, 1500);
    await r.cap("Taşa dokunup başka kareye taşıyabilirsin: süre bitmeden fikrini değiştirebilirsin.", 3500);
    await r.cap("Tüm kareleri doldurunca süre durur. Doğru taş +10, yanlış −5 puan.", 3500);
    await r.cap("Skorunu kaydedersen Skor Tablosu'nda görünürsün. İyi şanslar!", 2500);
  },
  // ------------------------------------------------------------------ 2
  async uzman(r, p) {
    await r.title("Uzman Modu", ["Aynı oyun, ama test sayısı sınırlı: az testle çok bilgi çıkar."]);
    await r.cap("Ana menüde SEVİYE 1'in altındaki \"Uzman modu\" kutusunu işaretle.", 1500);
    await r.click("#chk-expert", 800);
    await r.click("#btn-level1", 900);
    await r.cap("Sağdaki sayaç test sayını gösterir: ilk 24 test ücretsiz.", 3200);
    await r.cap("24'ü aşan her test −1 puan. Mantık yürüt, gereksiz test yapma!", 3200);
    const n = await r.cellOf("N");
    await r.tool("N", n, 1200);
    await r.cap("İtme = kesin N. Tek testle bulduk; sayaç 1 oldu.", 2800);
    await r.stone("N", n, 1200);
    const fe = await r.cellOf("Fe");
    await r.tool("Fe", fe, 1200);
    await r.cap("Demir aracı tepki vermedi: Fe ya da Cu. Bir test daha gerek.", 2800);
    await r.tool("N", fe, 1200);
    await r.cap("N aracı çekti, demir aracı vermedi → Fe. Sayaç 3.", 2800);
    await r.stone("Fe", fe, 1200);
    await r.cap("Test geçmişi karelerde yazılı kalır. Bu kutuyu kapatırsan hepsini aklında tutmalısın!", 3200);
    await r.click("#chk-history", 1500);
    await r.cap("Geçmiş gizli: tam bir hafıza oyunu. Kutuyu tekrar işaretlersen geri gelir.", 3200);
    await r.click("#chk-history", 1000);
    await r.cap("Az test, çok doğru taş: Uzman modunda en iyi puan böyle alınır.", 3000);
  },
  // ------------------------------------------------------------------ 3
  async yz(r) {
    await r.title("Yapay Zekâya Karşı", ["Sırayla oynanır. Her tur: bir zorunlu test + isteğe bağlı bir taş."]);
    await r.cap("Blöf kutusu BOŞ iken \"Yapay Zekâya Karşı\"ya bas.", 1800);
    await r.click("#btn-ai", 1000);
    await r.cap("Sırayla oynanır. Her turda önce bir test yaparsın. Test araçlarından birini seçersin.", 3300);
    const n = await r.cellOf("N");
    await r.tool("N", n, 1200);
    await r.cap("Tepkiyi herkes görür. İtme: kare kesin N. Şimdi taş yerleştirebilirsin.", 2800);
    await r.cap("Doğru taş +10, yanlış taş −10. İlk konan taş kareyi KİLİTLER.", 3300);
    await r.stone("N", n, 1500);
    await r.cap("Taşı koyunca sıra yapay zekâya geçer: o da test yapar ve taş koyabilir.", 2500);
    await r.myTurn();
    await r.cap("Yapay zekâ oynadı. Sıra sende! Rakibin testlerini kareler üstünde görebilirsin.", 3000);
    const fe = await r.cellOf("Fe");
    await r.tool("N", fe, 1200);
    await r.cap("Emin değilsen taş koymak zorunda değilsin: \"Taş koymadan bitir (Pas)\" düğmesi.", 3200);
    await r.click("#action-panel button", 1500);
    await r.myTurn();
    await r.cap("Herkes art arda 2 tam tur pas geçerse ZORUNLU TESPİT TURU başlar:", 3000);
    await r.cap("Test yapılmaz; herkes sırayla bir taş yerleştirmek zorundadır. Tahmin et!", 3200);
    await r.cap("Tüm kareler dolunca oyun biter; en yüksek puanlı kazanır.", 3000);
  },
  // ------------------------------------------------------------------ 4
  async yzblof(r) {
    await r.title("Yapay Zekâ + Blöf", ["Tepkiyi yalnızca testi yapan görür. Doğruyu söyleyebilir ya da blöf yapabilirsin!"]);
    await r.cap("Menüde \"Blöf modu\" kutusunu işaretle, sonra \"Yapay Zekâya Karşı\"ya bas.", 1500);
    await r.click("#chk-bluff", 800);
    await r.click("#btn-ai", 1000);
    const n = await r.cellOf("N"), fe = await r.cellOf("Fe");
    await r.cap("Test yap: bu modda tepkiyi ekranda yalnızca SEN görürsün.", 3000);
    await r.tool("N", n, 600);
    await r.cap("Şimdi rakibine tepkiyi açıklarsın: doğruyu söyle ya da blöf yap.", 3000);
    await r.click("#action-panel button:has-text('Blöf yapma')", 1200);
    await r.cap("Bu kez doğruyu söyledik. Taşı koyalım.", 2000);
    await r.stone("N", n, 1500);
    await r.cap("Sıra yapay zekâda. O da açıklama yapar: doğru söyleyebilir ya da blöf yapabilir.", 3200);
    await r.myTurn(async () => {
      await r.cap("Yapay zekâ bir test açıkladı. Sana itiraz hakkı geldi: blöf yapıyor mu?", 3500);
      await r.click("#action-panel button:has-text('Doğru söylüyor')", 1000);
    });
    await r.cap("Şimdi bir blöf deneyelim: gerçek tepkiyi sakla, başka bir tepki söyle.", 3000);
    await r.tool("N", fe, 600);
    await r.click("#action-panel button:has-text('Blöf yap')", 900);
    await r.cap("Gerçekte olmayan bir tepki seçiyoruz.", 1800);
    await r.click("#action-panel button:has-text('de')", 1200);
    await r.cap("Rakip itiraz ederse ve blöfü yakalarsa: yakalayan +10, blöfçü −10.", 3500);
    await r.cap("Haksız itiraz eden ise −10 kaybeder. Yapay zekâ da blöf yapıp itiraz edebilir!", 3500);
    await r.myTurn(async () => {
      await r.cap("Yapay zekânın tepkisine itiraz edebilirsin. Emin değilsen kabul et.", 3200);
      await r.click("#action-panel button:has-text('Doğru söylüyor')", 1000);
    });
    await r.cap("Test geçmişi karelerde açıklanan tepkileri gösterir; blöf olabileceğini unutma!", 3200);
  },
  // ------------------------------------------------------------------ 5
  async cok(r, p) {
    await r.title("Çok Oyunculu", ["Aynı cihazda sırayla (2–8 kişi) ya da arkadaşlarınla çevrimiçi."]);
    await r.cap("Seviye 2 bölümünde oyuncu sayısını seç. 2–4 oyuncuda tabla 4×4.", 3000);
    await r.click("input[name=pcount][value='4']", 700);
    await r.cap("Oyuncu adlarını yazabilirsin, sonra \"Oyunu Başlat\".", 2200);
    await r.click("#btn-level2", 1000);
    await r.cap("Herkes aynı ekrandan sırayla oynar. Sıra kimdeyse onun adı ve rengi yazar.", 3300);
    for (let k = 0; k < 4; k++) {
      const used = (await p.evaluate(() => Array.from(game.flags.keys())));
      const mats = ["N", "Fe", "S", "Cu"];
      const c = await r.cellOf(mats[k], used);
      await r.cap(`Oyuncu ${k + 1}: bir test yapar ve taşını koyar.`, 1500);
      await r.tool(k % 2 ? "Fe" : "N", c, 700);
      await r.tool && 0;
      await r.stone(mats[k], c, 1700);
      await r.myTurn().catch(() => {});
      await wait(300);
    }
    await r.cap("Herkesin taşı kendi rengindedir; kimin hangi kareye taş koyduğu görünür.", 3200);
    await r.click("#btn-menu", 900);
    await r.cap("5 ve daha çok oyuncuda tabla büyür: oyuncu sayısı × oyuncu sayısı.", 2800);
    await r.click("input[name=pcount][value='6']", 700);
    await r.click("#btn-level2", 1200);
    await r.cap("6 oyuncu → 6×6 tabla (36 kare). 8 oyuncuya kadar oynanabilir.", 3500);
    await r.click("#btn-menu", 900);
    await r.title("Çevrimiçi (Arkadaşlarla)", [
      "1) E-posta ya da kullanıcı adıyla hesap aç; yönetici onaylar (davet koduyla anında).",
      "2) Onaylı oyuncu oda kurar, 5 harflik kodu arkadaşlarına gönderir.",
      "3) Kurucu 2–8 oyuncu hazır olunca oyunu başlatır. Herkes kendi cihazında oynar.",
      "4) Oyun bitince puanlar Sıralama'ya otomatik yazılır.",
    ], 7500);
    await r.cap("Menüdeki \"🌐 Arkadaşlarla Oyna\" düğmesinden başla.", 1500);
    await r.click("#btn-online", 1500);
    await r.cap("Hesabınla giriş yap ya da kayıt ol. Kurallar tüm modlarda aynıdır.", 3500);
  },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const secilen = process.argv.slice(2);
  for (const ad of secilen.length ? secilen : Object.keys(SENARYOLAR)) {
    if (!SENARYOLAR[ad]) { console.log("bilinmeyen:", ad); continue; }
    await kayit(ad, SENARYOLAR[ad]);
  }
})();
