# 🧲 MANYETİK-HİS: Kutupların Savaşı

**Güncel oyun sürümü: v3.0** · **[▶️ Oyunu oyna: bilsemprojegrubu.github.io/Manyetik-His](https://bilsemprojegrubu.github.io/Manyetik-His/)** · [Oyun sürümleri](#-oyun-sürümleri)

Manyetik-His, görünmeyen manyetik kuvvetleri oyun yoluyla öğreten **eğitici bir mantık, hafıza ve manyetizma masa oyunudur**. Bu depoda oyunun dijitalleştirilmiş test sürümü ve güncellemeleri yer alır.

Tabladaki 16 gizli madde (N-Kutbu mıknatıs, S-Kutbu mıknatıs, demir ve bakır) dışarıdan birbirinin aynısı görünür. Oyuncular test araçlarını karelere yerleştirir. Hissettikleri itme, çekme ya da tepkisizlik üzerinden mantıksal çıkarım yaparak gizli maddeleri bulur ve kareye doğru tespit taşını koyar.

> Bu proje, Bilsem Proje Grubu'nun TÜBİTAK ve Teknofest çalışmaları kapsamında geliştirilmektedir. Dijital sürüm, gerçek masa oyununun kurallarını ve dengesini test etmek için hazırlanmıştır.

## 🔬 Oyundaki fizik ilkeleri

| Gizli madde | Demir test aracı | N-Kutbu test aracı | Çıkarım |
|---|---|---|---|
| **S-Kutbu mıknatıs** | Çeker | Çeker | Zıt kutup |
| **N-Kutbu mıknatıs** | Çeker | **İter** | Aynı kutup |
| **Demir (Fe)** | Tepki yok | Çeker | Ferromanyetik metal |
| **Bakır (Cu) / Nötr** | Tepki yok | Tepki yok | Manyetik olmayan metal |

İtme tepkisi yalnızca iki mıknatıs arasında oluştuğu için oyundaki en kesin veridir.

## 🕹️ Nasıl oynanır? (web sürümü)

1. **Oyunu aç:** <https://bilsemprojegrubu.github.io/Manyetik-His/> (bilgisayar, tablet ya da telefon; kurulum yok).
2. **Mod seç:** Seviye 1 (tek kişi), yapay zekâya karşı, ya da 2–8 kişilik Seviye 2. İstersen Uzman ve Blöf modlarını aç.
3. **Test et:** Sağdaki **test araçlarından** (Demir ya da N-Kutbu piyonu) birini sürükleyip bir kareye bırak. Piyonun tepkisi (⬇ çekme, ⬆ itme, • tepki yok) kareye not edilir.
4. **Çıkarım yap:** Tepkileri yukarıdaki tabloyla karşılaştır. İtme kesin bilgidir: itilen kare N-Kutbu mıknatıstır.
5. **Taş bırak:** Emin olduğun kareye doğru **tespit taşını** (N, S, Fe, Cu) sürükle. Telefonda önce taşa ya da araca dokun, sonra kareye dokun.
6. **Bitir:** Tüm kareler dolunca tabla açılır, doğrular yeşil, yanlışlar kırmızı çerçevelenir ve puanlar gösterilir. Seviye 1 skorun **🏆 Skor Tablosu**'na kaydedilir.
7. **Öğren:** Ana menüdeki **📚 Kartlara Göz At** bölümünden her malzemenin bilgi kartını (ön yüz: oyun etkisi, arka yüz: fizik bilgisi) oku.

## 🎮 Oyun modları

Web sürümünde ([`index.html`](index.html)) test araçları **piyonlar**, tespit taşları **kare taşlardır**; hepsi sürüklenip karelere bırakılır (dokunmatik ekranda önce seçilip sonra kareye dokunulur). Taşların üzerinde kabartma harf (N, S, Fe, Cu) ve renk körlüğü için oyuncuya özel bir şekil işareti bulunur. Her malzemeden tabladaki sayı kadar taş vardır.

**Seviye 1: Tek oyunculu, zamana karşı**
- İki test aracını da dilediğin sırayla kullanırsın.
- Tüm karelere taş koyunca kronometre durur ve tabla açılır. Taşlar süre durana dek değiştirilebilir.
- Doğru taş **+10**, yanlış taş **−5** puan. Skor, Supabase skor tablosuna kaydedilir.
- **Uzman modu:** 24 test ücretsizdir, fazladan her test −1 puandır.

**Seviye 2: Çok oyunculu (2–8 oyuncu) ve yapay zekâya karşı**
- Oyuncular sırayla oynar. Bir tur, **zorunlu bir test** (iki araçtan birini seçersin) ve **isteğe bağlı bir taş yerleştirmeden** oluşur; taş koymadan bitirmek **pas**tır.
- İlk konan taş kareyi kilitler. Doğru taş **+10**, yanlış taş **−10** puan.
- Tüm oyuncular art arda iki tam tur pas geçerse **Zorunlu Tespit Turu** başlar: herkes sırayla bir taş yerleştirmek zorundadır.
- **Tabla boyutu:** 2–4 oyuncuda 4×4 (16 kare). 5–8 oyuncuda oyuncu sayısı × oyuncu sayısı (25, 36, 49, 64 kare). Malzemeler eşit dağıtılır; 5×5 ve 7×7'de 4'e bölünmeyen tek kare bakıra eklenir.
- **Yapay zekâya karşı (2 kişilik):** Yapay zekâ, herkese açık test bilgilerinden çıkarım yapar, yalnızca kesin bildiği kareye taş koyar.
- **Blöf modu (isteğe bağlı):** Test eden tepkiyi gizlice görür, sonra doğruyu ya da başka bir tepkiyi açıklar. Sıradaki oyuncu itiraz edebilir: blöfü yakalarsa **+10** (blöf yapan −10), haksız çıkarsa **−10**. Yapay zekâ duruma göre blöf yapar ve itiraz eder.

**📚 Kartlara Göz At:** Ana menüden bilgi kartlarına ulaşılır. Kart metinleri ve görselleri [`cards.js`](cards.js) dosyasından eklenir.

## ▶️ Nasıl çalıştırılır?

**Web sürümü:** <https://bilsemprojegrubu.github.io/Manyetik-His/> adresinden açılır ya da `index.html` tarayıcıda açılır. Aşağıdaki Python sürümü eski masaüstü sürümüdür ve yalnızca temel kuralları içerir.

Gereken tek şey **Python 3.8 veya üzeri**dir (Tkinter Python ile birlikte gelir, ek kurulum yoktur).

1. [`manyetik_his.py`](manyetik_his.py) dosyasını indir.
2. Dosyanın bulunduğu klasörde şu komutu çalıştır:

   ```bash
   python manyetik_his.py
   ```

   macOS ve Linux'ta `python3 manyetik_his.py` gerekebilir.
3. Windows'ta alternatif olarak dosyayı **IDLE** ile açıp **Run → Run Module** (F5) yapabilirsin.

Kısayollar: **F11** tam ekran, **Esc** tam ekrandan çıkış.

> Windows'ta Python kurarken **"Add Python to PATH"** ve **"tcl/tk and IDLE"** seçeneklerinin işaretli olduğundan emin ol.

## ⚙️ Ayarlar

Denge testleri için [`script.js`](script.js) dosyasının başındaki `AYARLAR` bölümünden şunlar değiştirilebilir:

- `L1_CORRECT`, `L1_WRONG`: Seviye 1 puanları
- `L2_CORRECT`, `L2_WRONG`: Seviye 2 puanları
- `EXPERT_FREE_TESTS`: Uzman modunda ücretsiz test sayısı
- `PASS_ROUNDS_FOR_FORCED`: Zorunlu Tespit Turu için gereken art arda pas turu
- `BLUFF_CAUGHT`, `BLUFF_FALSE_ALARM`: Blöf itirazı puanları
- `compositionFor()`: Tablodaki madde dağılımı

## 🗺️ Yol haritası

- [x] Seviye 1 (tek oyunculu, zamana karşı)
- [x] Seviye 2 (aynı cihazda çok oyunculu)
- [x] Web sürümü ve tam ekran desteği
- [x] Skor kaydı ve rekor tablosu (Supabase)
- [x] Animasyonlar
- [x] Zorluk ayarları (Uzman modu)
- [x] Yapay zekâ rakibi, blöf modu, 8 oyuncuya kadar
- [x] Bilgi kartları
- [ ] Ses efektleri
- [ ] İnternet üzerinden uzaktan çok oyunculu (Supabase Realtime)
- [ ] Hesap girişi ve kişisel skorlar

## 📜 Oyun sürümleri

Bu tablo oyunun kendi sürümlerini anlatır: kurallar, modlar, oynanış ve görünüm.

| Oyun sürümü | Tarih | Oyunda neler değişti |
|---|---|---|
| **v3.0** | 23 Eki 2026 | **Görünüm:** ahşap tahta temalı arayüz. "Test et / bayrak dik" seçenekleri yerine kare **tespit taşları** (N, S, Fe, Cu) ve altı kare **piyon test araçları**; hepsi sürükle-bırak. Taş bırakma ve çekme / itme / tepki yok animasyonları. **Yeni modlar:** yapay zekâya karşı 2 kişilik oyun, blöf modu (blöf, itiraz, puanlama), Uzman modu (24 ücretsiz test). **Oyuncu sayısı:** 8 kişiye kadar; 5+ oyuncuda tabla n×n. **Bilgi kartları:** 5 kart, ön yüzde oyun etkisi, arka yüzde fizik bilgisi. **Kural düzeltmeleri:** Seviye 2'de her turda iki araçtan birini seçme, zorunlu test, pas ve Zorunlu Tespit Turu. |
| **v2.1** | 23 Eki 2026 | Seviye 1 skoru kaydedilir; menüden en iyi 10 oyuncu görülür (skor tablosu). |
| **v2.0** | 16 Eki 2026 | Oyun tarayıcıda oynanır hâle geldi. Kurallar v1 ile aynı. |
| **v1.0** | 11 Eki 2026 | İlk sürüm: 4×4 tabla, 16 gizli madde (4 N, 4 S, 4 Fe, 4 Cu), Demir ve N-Kutbu test araçları. Seviye 1 (tek oyunculu, zamana karşı) ve Seviye 2 (2–4 oyunculu). |

## 📄 Dosyalar

| Dosya | Açıklama |
|---|---|
| [`index.html`](index.html) | Web sürümünün sayfası |
| [`style.css`](style.css) | Ahşap tema, taşlar, piyonlar ve animasyonlar |
| [`script.js`](script.js) | Oyun mantığı, yapay zekâ, blöf ve skor tablosu |
| [`cards.js`](cards.js) | Bilgi kartlarının içeriği |
| [`manyetik_his.py`](manyetik_his.py) | Eski masaüstü sürümü (v1, Tkinter) |
| `README.md` | Bu tanıtım sayfası |

> **Güncelleme notu:** `index.html` içindeki `style.css?v=3.0`, `cards.js?v=3.0` ve `script.js?v=3.0` numarasını her sürümde artır. Böylece telefon ve tarayıcılar eski dosyaları önbellekten göstermez.

---

*Bilsem Proje Grubu*
