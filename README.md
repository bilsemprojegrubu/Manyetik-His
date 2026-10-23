# 🧲 MANYETİK-HİS: Kutupların Savaşı

Manyetik-His, görünmeyen manyetik kuvvetleri oyun yoluyla öğreten **eğitici bir mantık, hafıza ve manyetizma masa oyunudur**. Bu depoda oyunun dijitalleştirilmiş test sürümü ve güncellemeleri yer alır.

Tabladaki 16 gizli madde (N-Kutbu mıknatıs, S-Kutbu mıknatıs, demir ve bakır) dışarıdan birbirinin aynısı görünür. Oyuncular elindeki test araçlarını karelere yerleştirir. Hissettikleri itme, çekme ya da tepkisizlik üzerinden mantıksal çıkarım yaparak gizli maddeleri bulur ve kareye doğru bayrağı diker.

> Bu proje, Bilsem Proje Grubu'nun TÜBİTAK ve Teknofest çalışmaları kapsamında geliştirilmektedir. Dijital sürüm, gerçek masa oyununun kurallarını ve dengesini test etmek için hazırlanmıştır.

## 🔬 Oyundaki fizik ilkeleri

| Gizli madde | Demir test aracı | N-Kutbu test aracı | Çıkarım |
|---|---|---|---|
| **S-Kutbu mıknatıs** | Çeker | Çeker | Zıt kutup |
| **N-Kutbu mıknatıs** | Çeker | **İter** | Aynı kutup |
| **Demir (Fe)** | Tepki yok | Çeker | Ferromanyetik metal |
| **Bakır (Cu) / Nötr** | Tepki yok | Tepki yok | Manyetik olmayan metal |

İtme tepkisi yalnızca iki mıknatıs arasında oluştuğu için oyundaki en kesin veridir.

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

Dosyanın başındaki `AYARLAR` bölümünden denge testleri için şunları değiştirebilirsin:

- `COMPOSITION`: Tablodaki madde sayıları (toplam 16 olmalı)
- `L1_CORRECT`, `L1_WRONG`: Seviye 1 puanları
- `L2_CORRECT`, `L2_WRONG`: Seviye 2 puanları

## 🗺️ Yol haritası

- [x] Seviye 1 (tek oyunculu, zamana karşı)
- [x] Seviye 2 (aynı bilgisayarda çok oyunculu)
- [x] Tam ekran desteği
- [ ] Çok oyunculu modun testleri
- [ ] Skor kaydı ve rekor tablosu
- [ ] Ses ve animasyonlar
- [ ] Zorluk ayarları

## 📄 Dosyalar

| Dosya | Açıklama |
|---|---|
| [`manyetik_his.py`](manyetik_his.py) | Oyunun tamamı (tek dosya) |
| `README.md` | Bu tanıtım sayfası |

---

*Bilsem Proje Grubu*
