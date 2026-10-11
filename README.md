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

**Seviye 1: Tek oyunculu, zamana karşı**
- İki test aracını da dilediğin sırayla kullanırsın.
- 16 karenin hepsine bayrak dikince kronometre durur ve tabla açılır.
- Doğru bayrak **+10**, yanlış bayrak **−5** puan.

**Seviye 2: Çok oyunculu (2–4 oyuncu), stratejik hafıza ve çıkarım**
- Oyuncular sırayla test eder, rakiplerin yaptığı testleri aklında tutar.
- Her turda bir test ve bir bayrak hakkı vardır.
- İlk dikilen bayrak kareyi kilitler.
- Doğru bayrak **+10**, yanlış bayrak **−10** puan.

## ▶️ Nasıl çalıştırılır?

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
