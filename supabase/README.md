# Çevrimiçi mod: Supabase kurulumu

Oyunun **🌐 Arkadaşlarla Oyna** bölümü Supabase'i kullanır. Bu klasördeki
[`01_cevrimici_oyun.sql`](01_cevrimici_oyun.sql) dosyası gereken tabloları ve oyun kurallarını kurar.
Kurulum bir kez yapılır ve yaklaşık 5 dakika sürer.

## Nasıl çalışır?

- **Hesaplar:** Oyuncular **e-posta adresi** (ya da kullanıcı adı) ve şifreyle kayıt olur. Bir **yönetici onaylayana kadar** oda kuramaz
  ya da odaya katılamaz. Geçerli bir **davet koduyla** kayıt olan hemen onaylanır.
- **Yönetici:** Başvuruları onaylar ya da reddeder, başkasını yönetici yapar, davet kodu üretir.
- **Odalar:** Onaylı bir oyuncu oda kurar, 5 harflik kodu (ya da bağlantıyı) arkadaşlarına gönderir.
  Oda kurucusu oyuncuları çıkarabilir, odayı başka birine devredebilir ve oyunu başlatır (2–8 oyuncu).
- **Hile koruması:** Gizli tahta ve oyun kuralları **sunucuda** (veritabanı fonksiyonlarında) çalışır.
  Tarayıcı tablolara doğrudan erişemez, yalnızca fonksiyonları çağırır. Gizli tahta, oyun bitmeden hiçbir
  oyuncunun tarayıcısına gönderilmez.

## Kurulum adımları

### 1) Veritabanını kur
1. [supabase.com](https://supabase.com) → projenizi (ör. `manyetik his`) açın.
2. Sol menüden **SQL Editor** → **New query**.
3. [`01_cevrimici_oyun.sql`](01_cevrimici_oyun.sql) dosyasının **tamamını** kopyalayıp yapıştırın ve **Run**'a basın.
4. Altta "Success" yazmalı. Dosya tekrar çalıştırılabilir, zararı olmaz.

Daha önce kurduğunuz `skorlar` tablosuna (skor tablosu) dokunulmaz.

### 2) E-posta doğrulama ayarı
Giriş, Medar'daki gibi **"E-posta veya kullanıcı adı"** alanıyla yapılır: içinde `@` varsa gerçek e-posta,
yoksa kullanıcı adı olarak işlenir (arka planda `kullaniciadi@oyuncu.manyetik.invalid` biçiminde sahte bir
adres kullanılır).

1. Sol menü **Authentication** → **Sign In / Providers** → **Email**.
2. **Allow new users to sign up** **açık** olmalı.
3. **Confirm email** için iki seçenek var:
   - **Kapalı (önerilen):** Kayıt olan hemen giriş yapabilir. Güvenliği yönetici onayı sağlar: onaylanmamış hesap
     oda kuramaz. Supabase'in kendi e-posta servisi saatte çok az doğrulama e-postası gönderebildiği için
     sınıf kaydında takılmamak için bu daha pratiktir. Kullanıcı adıyla kayıt da yalnızca bu durumda çalışır.
   - **Açık:** Gerçek e-postayla kayıt olanlara doğrulama e-postası gider, bağlantıya tıklayınca giriş yapabilirler.
     Çok kişi kayıt olacaksa Supabase'de özel bir e-posta servisi (SMTP) tanımlamanız gerekir.
4. **Save changes** ile kaydedin.

### 3) İlk yöneticiyi oluşturun
1. Oyunun sitesini açın → **🌐 Arkadaşlarla Oyna (Çevrimiçi)** → **Kayıt ol**. E-posta adresinizi, görünen
   adınızı ve şifrenizi yazın. "Onay bekleniyor" ekranı gelir.
2. Supabase'de **SQL Editor** → **New query**, kendi e-postanızla şunu çalıştırın:

   ```sql
   update public.profiller set rol = 'yonetici', onayli = true
   where id = (select id from auth.users where email = 'sizin@epostaniz.com');
   ```

   (E-posta küçük harfle yazılır. Kullanıcı adıyla kayıt olduysanız e-posta yerine
   `kullaniciadiniz@oyuncu.manyetik.invalid` yazın; Türkçe harfler `ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u`, boşluk nokta olur.)
3. Sayfaya dönüp **Onaylandı mı, kontrol et**'e basın. Ana sayfada **🛠 Yönetim paneli** görünür.

Bu adım yalnızca ilk yönetici için gerekir. Sonrasında yönetim panelinden başkalarını yönetici yaparsınız.

### 4) Arkadaşları davet edin
- **Yönetim paneli → Davet kodları** bölümünden kod oluşturun, **Bağlantıyı kopyala** deyip gönderin.
  Bu bağlantıyla kayıt olanlar yönetici onayı beklemeden hemen oynar.
- Ya da kodsuz kayıt olmalarını söyleyin; başvuruları **Onay bekleyenler** sekmesinde onaylarsınız.

## Oynama
1. Onaylı oyuncu **Oda kur** der (isterse **Blöf modu**nu açar). 5 harflik **oda kodu** çıkar.
2. Arkadaşlar **Odaya katıl** bölümüne kodu yazar ya da **Bağlantıyı kopyala** ile gelen bağlantıyı açar.
3. Kurucu en az 2 oyuncu olunca **Oyunu başlat** der. 5 ve üzeri oyuncuda tabla büyür (n×n).
4. Oyun bitince kurucu **Yeni oyun için odayı aç** diyebilir.

## Bilinmesi gerekenler
- **Gecikme:** Oyun, sunucuyu yaklaşık 1,2 saniyede bir yoklar; arkadaşlarınızın hamlesi birkaç saniye içinde görünür.
- **Bağlantısı kopan oyuncu:** Kurucu, bekleme ekranındaki **Sırayı geç** düğmesiyle sırayı atlatabilir.
  Oyuncu sayfayı yenilerse **Odalarım** listesinden odaya geri döner.
- **Şifre sıfırlama henüz yoktur.** Şifresini unutanın hesabını yönetici silip oyuncu yeniden kayıt olur.
- Odalar 3 gün sonra otomatik silinir. Bir kullanıcı en fazla 5 açık oda kurabilir.

## Güvenlik notları
- Sitedeki `anon` (publishable) anahtar herkese açıktır ve öyle kalmalıdır. **`service_role` / secret anahtarını
  asla koda ya da GitHub'a koymayın.**
- Tablolarda tarayıcı için hiçbir okuma/yazma izni yoktur (RLS açık, politika yok); yalnızca
  `SECURITY DEFINER` fonksiyonlar çalışır. Gizli tahta tablosu (`oda_gizli`) tarayıcıdan okunamaz.
- Yönetici işlemleri her çağrıda sunucuda yeniden doğrulanır; öğrenci hesabı kendini yönetici yapamaz.

## Test durumu (dürüst özet)
SQL dosyası gerçek bir **Postgres 16** üzerinde çalıştırılarak denendi (Supabase'in `auth` şeması taklit edilerek):
hesap ve onay, davet kodu, yetki ve hile denemeleri, oda yönetimi, sırayla hamleler, blöf ve itiraz, zorunlu
tespit turu, puanlar, taş limiti, oda limiti (73 kontrol). Arayüz, bu fonksiyonları çağıran sahte bir Supabase
istemcisiyle üç ayrı tarayıcı sayfasında (yönetici, iki oyuncu) uçtan uca denendi. **Gerçek bir Supabase
projesine karşı denenmedi**; ilk kurulumdan sonra yukarıdaki "Oynama" adımlarını iki farklı tarayıcıda deneyin.
Bir hata görürseniz ekranda çıkan mesajı iletin.
