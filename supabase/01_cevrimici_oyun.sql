-- =============================================================================
-- MANYETİK-HİS — Çevrimiçi oyun: hesaplar, yönetici onayı, odalar, sunucu yetkili oyun
-- =============================================================================
-- Supabase panelinde SQL Editor > New query'ye yapıştırıp Run'a basın.
-- Dosya tekrar çalıştırılabilir (create or replace / if not exists kullanır).
--
-- TASARIM (Medar'daki yapıya benzer):
--   * Kullanıcılar kullanıcı adı + şifre ile kayıt olur. Yönetici onaylayana kadar
--     (profiller.onayli) oda kuramaz/katılamaz. Geçerli davet koduyla kayıt olan
--     otomatik onaylanır. Yönetici başkasını yönetici yapabilir.
--   * Oyun SUNUCUDA çalışır: gizli tahta ve kurallar yalnızca SECURITY DEFINER
--     fonksiyonlarda yaşar. Tarayıcı tablolara doğrudan okuma/yazma yapamaz,
--     yalnızca aşağıdaki fonksiyonları (RPC) çağırır. Gizli tahta (oda_gizli)
--     için hiçbir politika yoktur: tarayıcıdan okunamaz.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Tablolar
-- -----------------------------------------------------------------------------
create table if not exists public.profiller (
  id          uuid primary key references auth.users (id) on delete cascade,
  gorunen_ad  text not null,
  rol         text not null default 'ogrenci' check (rol in ('ogrenci', 'yonetici')),
  onayli      boolean not null default false,
  davet_kodu  text,
  olusturma   timestamptz not null default now()
);

create table if not exists public.davet_kodlari (
  kod           text primary key,
  aktif         boolean not null default true,
  max_kullanim  int check (max_kullanim is null or max_kullanim > 0),
  kullanilan    int not null default 0,
  bitis         timestamptz,
  olusturan     uuid references auth.users (id) on delete set null,
  olusturma     timestamptz not null default now()
);

create table if not exists public.odalar (
  id          uuid primary key default gen_random_uuid(),
  kod         text not null unique,
  kurucu      uuid not null references auth.users (id) on delete cascade,
  durum       text not null default 'bekleme' check (durum in ('bekleme', 'oyunda', 'bitti')),
  blof        boolean not null default false,
  durum_json  jsonb not null default '{}'::jsonb,   -- herkese açık oyun durumu
  surum       int not null default 0,
  olusturma   timestamptz not null default now()
);

create table if not exists public.oda_oyunculari (
  oda_id        uuid not null references public.odalar (id) on delete cascade,
  kullanici_id  uuid not null references auth.users (id) on delete cascade,
  ad            text not null,
  sira          int,                                  -- oyun başlayınca koltuk no (0'dan)
  katilma       timestamptz not null default now(),
  primary key (oda_id, kullanici_id)
);

-- Gizli bilgiler: tahta, itiraz puanları, blöf için gerçek tepkiler.
create table if not exists public.oda_gizli (
  oda_id           uuid primary key references public.odalar (id) on delete cascade,
  tahta            text[] not null default '{}',
  bonus            int[] not null default '{}',
  bekleyen_gercek  text,       -- açıklaması bekleyen testin gerçek tepkisi
  iddia_gercek     text,       -- son açıklanan testin gerçek tepkisi
  iddia_blof       boolean     -- son açıklama blöf müydü
);

-- Bitmiş çevrimiçi oyunların sonuçları (sıralama için). Odalar silinse de kayıt kalır.
create table if not exists public.mac_sonuclari (
  id             bigint generated always as identity primary key,
  mac_id         uuid not null,                    -- aynı oyunun satırlarını birleştirir
  oda_kod        text not null,
  kullanici_id   uuid not null references auth.users (id) on delete cascade,
  ad             text not null,
  puan           int not null,
  kazandi        boolean not null,                 -- en yüksek puanı alan(lar)
  oyuncu_sayisi  int not null,
  blof           boolean not null default false,
  bitis          timestamptz not null default now()
);
create index if not exists mac_sonuclari_kullanici_idx on public.mac_sonuclari (kullanici_id);
create index if not exists mac_sonuclari_bitis_idx on public.mac_sonuclari (bitis desc);

alter table public.profiller      enable row level security;
alter table public.mac_sonuclari  enable row level security;
alter table public.davet_kodlari  enable row level security;
alter table public.odalar         enable row level security;
alter table public.oda_oyunculari enable row level security;
alter table public.oda_gizli      enable row level security;
-- Bu tablolarda tarayıcı rolleri için KASITLI olarak politika yoktur: tüm erişim
-- aşağıdaki SECURITY DEFINER fonksiyonlar üzerinden olur.

-- -----------------------------------------------------------------------------
-- 2) Yardımcılar
-- -----------------------------------------------------------------------------
create or replace function public.is_yonetici() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiller p where p.id = auth.uid() and p.rol = 'yonetici' and p.onayli);
$$;

create or replace function public.is_onayli() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiller p where p.id = auth.uid() and p.onayli);
$$;

-- Yeni kullanıcı: profil satırı aç; geçerli davet koduyla geldiyse otomatik onayla.
create or replace function public.yeni_kullanici() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kod text := nullif(upper(trim(new.raw_user_meta_data ->> 'davet_kodu')), '');
  v_row public.davet_kodlari%rowtype;
  v_ok  boolean := false;
begin
  if v_kod is not null then
    select * into v_row from public.davet_kodlari where upper(kod) = v_kod for update;
    if found and v_row.aktif
       and (v_row.bitis is null or v_row.bitis > now())
       and (v_row.max_kullanim is null or v_row.kullanilan < v_row.max_kullanim) then
      update public.davet_kodlari set kullanilan = kullanilan + 1 where kod = v_row.kod;
      v_ok := true;
    end if;
  end if;

  insert into public.profiller (id, gorunen_ad, rol, onayli, davet_kodu)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'gorunen_ad'), ''), split_part(new.email, '@', 1), 'Oyuncu'), 20),
    'ogrenci',
    v_ok,
    case when v_ok then v_row.kod else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists yeni_kullanici_tetik on auth.users;
create trigger yeni_kullanici_tetik after insert on auth.users
  for each row execute function public.yeni_kullanici();

-- -----------------------------------------------------------------------------
-- 3) Hesap ve yönetim fonksiyonları
-- -----------------------------------------------------------------------------
create or replace function public.ben() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'gorunen_ad', p.gorunen_ad, 'rol', p.rol, 'onayli', p.onayli)
  from public.profiller p where p.id = auth.uid();
$$;

-- Kayıt formu için: tek bir kod şu an kullanılabilir mi (kod listesini ifşa etmez).
create or replace function public.kod_gecerli(p_kod text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.davet_kodlari c
    where upper(c.kod) = upper(trim(p_kod)) and c.aktif
      and (c.bitis is null or c.bitis > now())
      and (c.max_kullanim is null or c.kullanilan < c.max_kullanim)
  );
$$;

create or replace function public.admin_kullanicilar() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_yonetici() then raise exception 'Bu işlem için yönetici olmalısın'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'gorunen_ad', p.gorunen_ad, 'rol', p.rol, 'onayli', p.onayli,
      'davet_kodu', p.davet_kodu, 'olusturma', p.olusturma,
      'giris', case when u.email like '%@oyuncu.manyetik.invalid' then split_part(u.email, '@', 1) else u.email end
    ) order by p.onayli, p.olusturma desc)
    from public.profiller p join auth.users u on u.id = p.id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_onayla(p_id uuid, p_onayli boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_yonetici() then raise exception 'Bu işlem için yönetici olmalısın'; end if;
  if p_id = auth.uid() and not p_onayli then raise exception 'Kendi onayını kaldıramazsın'; end if;
  update public.profiller set onayli = p_onayli where id = p_id;
end;
$$;

create or replace function public.admin_rol(p_id uuid, p_rol text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_yonetici() then raise exception 'Bu işlem için yönetici olmalısın'; end if;
  if p_rol not in ('ogrenci', 'yonetici') then raise exception 'Geçersiz rol'; end if;
  if p_id = auth.uid() and p_rol <> 'yonetici' then
    if not exists (select 1 from public.profiller where rol = 'yonetici' and onayli and id <> auth.uid()) then
      raise exception 'Tek yönetici sensin; önce başka birini yönetici yap';
    end if;
  end if;
  update public.profiller set rol = p_rol, onayli = case when p_rol = 'yonetici' then true else onayli end where id = p_id;
end;
$$;

-- Başvuruyu reddet / hesabı sil
create or replace function public.admin_sil(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_yonetici() then raise exception 'Bu işlem için yönetici olmalısın'; end if;
  if p_id = auth.uid() then raise exception 'Kendi hesabını silemezsin'; end if;
  delete from auth.users where id = p_id;
end;
$$;

create or replace function public.admin_kodlar() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_yonetici() then raise exception 'Bu işlem için yönetici olmalısın'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) - 'olusturan' order by c.olusturma desc) from public.davet_kodlari c), '[]'::jsonb);
end;
$$;

create or replace function public.admin_kod_olustur(p_kod text, p_max int default null, p_gun int default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_yonetici() then raise exception 'Bu işlem için yönetici olmalısın'; end if;
  if p_kod is null or length(trim(p_kod)) < 4 then raise exception 'Kod en az 4 karakter olmalı'; end if;
  insert into public.davet_kodlari (kod, max_kullanim, bitis, olusturan)
  values (upper(trim(p_kod)), p_max, case when p_gun is null then null else now() + make_interval(days => p_gun) end, auth.uid());
end;
$$;

create or replace function public.admin_kod_kapat(p_kod text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_yonetici() then raise exception 'Bu işlem için yönetici olmalısın'; end if;
  update public.davet_kodlari set aktif = false where upper(kod) = upper(trim(p_kod));
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Oyun kuralları (istemcideki script.js ile aynı)
-- -----------------------------------------------------------------------------
create or replace function public.mh_tepki(p_arac text, p_malzeme text) returns text
language sql immutable as $$
  select case
    when p_arac = 'Fe' then case when p_malzeme in ('N', 'S') then 'cekme' else 'yok' end
    when p_arac = 'N'  then case when p_malzeme = 'N' then 'itme'
                                 when p_malzeme in ('S', 'Fe') then 'cekme' else 'yok' end
  end;
$$;

-- 4x4'te 4'er adet; n x n tablada 4'e bölünmeyen artan kare bakıra eklenir.
create or replace function public.mh_dagilim(p_boyut int) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'N', (p_boyut * p_boyut) / 4, 'S', (p_boyut * p_boyut) / 4, 'Fe', (p_boyut * p_boyut) / 4,
    'Cu', p_boyut * p_boyut - 3 * ((p_boyut * p_boyut) / 4));
$$;

create or replace function public.mh_tahta(p_boyut int) returns text[]
language plpgsql volatile as $$
declare d jsonb := public.mh_dagilim(p_boyut); r text[];
begin
  select array_agg(q.mat order by random()) into r
  from (
    select v.mat from (values ('N'), ('S'), ('Fe'), ('Cu')) v(mat)
    cross join lateral generate_series(1, (d ->> v.mat)::int) g(i)
  ) q;
  return r;
end;
$$;

create or replace function public.mh_puanlar(s jsonb, tahta text[], bonus int[]) returns int[]
language plpgsql immutable as $$
declare p int[] := bonus; k text; v jsonb; i int;
begin
  for k, v in select key, value from jsonb_each(s -> 'bayraklar') loop
    i := (v ->> 'o')::int + 1;
    if tahta[k::int + 1] = v ->> 's' then p[i] := p[i] + 10; else p[i] := p[i] - 10; end if;
  end loop;
  return p;
end;
$$;

create or replace function public.mh_kayit(s jsonb, h int, o int, a text, r text) returns jsonb
language plpgsql immutable as $$
declare cur jsonb := coalesce(s -> 'testler' -> (h::text), '[]'::jsonb);
begin
  cur := cur || jsonb_build_array(jsonb_build_object('o', o, 'a', a, 'r', r, 'ifsa', false, 'onay', false));
  return jsonb_set(s, array['testler', h::text], cur, true);
end;
$$;

-- Turu bitirir, sırayı ilerletir; art arda pas ve itiraz hakkını işler.
create or replace function public.mh_tur_bitir(s jsonb, p_blof boolean) returns jsonb
language plpgsql immutable as $$
declare
  n int := jsonb_array_length(s -> 'oyuncular');
  pas int := (s ->> 'pas_serisi')::int;
  cur int;
  claim jsonb := s -> 'iddia';
begin
  if (s ->> 'tas_kondu')::boolean then pas := 0; else pas := pas + 1; end if;
  s := jsonb_set(s, '{pas_serisi}', to_jsonb(pas));
  if not (s ->> 'zorunlu')::boolean and pas >= 2 * n then
    s := jsonb_set(s, '{zorunlu}', 'true'::jsonb);
  end if;
  cur := ((s ->> 'sira')::int + 1) % n;
  s := s || jsonb_build_object('sira', cur, 'test_yapildi', false, 'tas_kondu', false,
                                'faz', 'oyun', 'iddia', null, 'itiraz', null);
  -- itiraz hakkı yalnızca hemen sonraki oyuncuya aittir
  if p_blof and claim is not null and jsonb_typeof(claim) = 'object'
     and (claim ->> 'oyuncu')::int <> cur and not (s ->> 'zorunlu')::boolean then
    s := s || jsonb_build_object('faz', 'itiraz', 'itiraz', claim);
  end if;
  return s;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Oda görünümü
-- -----------------------------------------------------------------------------
create or replace function public.mh_oda_json(p_oda uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.odalar%rowtype; me public.oda_oyunculari%rowtype; oy jsonb;
begin
  select * into r from public.odalar where id = p_oda;
  if not found then return null; end if;
  select * into me from public.oda_oyunculari where oda_id = p_oda and kullanici_id = auth.uid();
  if not found then raise exception 'Bu odanın üyesi değilsin'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', kullanici_id, 'ad', ad, 'sira', sira,
           'kurucu', kullanici_id = r.kurucu) order by coalesce(sira, 999), katilma), '[]'::jsonb)
    into oy from public.oda_oyunculari where oda_id = p_oda;
  return jsonb_build_object('id', r.id, 'kod', r.kod, 'durum', r.durum, 'blof', r.blof, 'surum', r.surum,
    'kurucu', r.kurucu = auth.uid(),
    'benim', jsonb_build_object('id', me.kullanici_id, 'ad', me.ad, 'sira', me.sira),
    'oyuncular', oy, 'oyun', r.durum_json);
end;
$$;

-- Yoklama için: sürüm değişmediyse küçük yanıt döner.
create or replace function public.oda_getir(p_oda uuid, p_surum int default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v int;
begin
  select surum into v from public.odalar where id = p_oda;
  if not found then return jsonb_build_object('yok', true); end if;
  if p_surum is not null and p_surum = v
     and exists (select 1 from public.oda_oyunculari where oda_id = p_oda and kullanici_id = auth.uid()) then
    return jsonb_build_object('degisti', false);
  end if;
  return public.mh_oda_json(p_oda);
end;
$$;

create or replace function public.odalarim() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kod', o.kod, 'durum', o.durum, 'blof', o.blof,
           'kurucu', o.kurucu = auth.uid(),
           'oyuncu_sayisi', (select count(*) from public.oda_oyunculari x where x.oda_id = o.id))
         order by o.olusturma desc), '[]'::jsonb)
  from public.odalar o join public.oda_oyunculari m on m.oda_id = o.id and m.kullanici_id = auth.uid()
  where o.durum <> 'bitti' or o.olusturma > now() - interval '1 day';
$$;

-- -----------------------------------------------------------------------------
-- 6) Oda yönetimi
-- -----------------------------------------------------------------------------
create or replace function public.oda_kur(p_blof boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kod text; v_id uuid; v_ad text;
  harf text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if not public.is_onayli() then raise exception 'Hesabın henüz onaylanmadı'; end if;
  select gorunen_ad into v_ad from public.profiller where id = auth.uid();
  -- bakım: 3 günden eski odaları sil; kullanıcı başına en fazla 5 açık oda
  delete from public.odalar where olusturma < now() - interval '3 days';
  if (select count(*) from public.odalar where kurucu = auth.uid() and durum <> 'bitti') >= 5 then
    raise exception 'En fazla 5 açık odan olabilir; eski odalarından ayrıl ya da oyunlarını bitir';
  end if;
  loop
    v_kod := '';
    for i in 1..5 loop v_kod := v_kod || substr(harf, 1 + floor(random() * length(harf))::int, 1); end loop;
    exit when not exists (select 1 from public.odalar where kod = v_kod);
  end loop;
  insert into public.odalar (kod, kurucu, blof) values (v_kod, auth.uid(), coalesce(p_blof, false)) returning id into v_id;
  insert into public.oda_oyunculari (oda_id, kullanici_id, ad) values (v_id, auth.uid(), v_ad);
  insert into public.oda_gizli (oda_id) values (v_id);
  return public.mh_oda_json(v_id);
end;
$$;

create or replace function public.odaya_katil(p_kod text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.odalar%rowtype; v_ad text;
begin
  if not public.is_onayli() then raise exception 'Hesabın henüz onaylanmadı'; end if;
  select * into r from public.odalar where kod = upper(trim(p_kod)) for update;
  if not found then raise exception 'Bu kodla bir oda bulunamadı'; end if;
  if exists (select 1 from public.oda_oyunculari where oda_id = r.id and kullanici_id = auth.uid()) then
    return public.mh_oda_json(r.id);          -- odaya geri dönüş
  end if;
  if r.durum <> 'bekleme' then raise exception 'Bu odada oyun başlamış'; end if;
  if (select count(*) from public.oda_oyunculari where oda_id = r.id) >= 8 then
    raise exception 'Oda dolu (en fazla 8 oyuncu)';
  end if;
  select gorunen_ad into v_ad from public.profiller where id = auth.uid();
  insert into public.oda_oyunculari (oda_id, kullanici_id, ad) values (r.id, auth.uid(), v_ad);
  update public.odalar set surum = surum + 1 where id = r.id;
  return public.mh_oda_json(r.id);
end;
$$;

create or replace function public.odadan_ayril(p_oda uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.odalar%rowtype; v_yeni uuid;
begin
  select * into r from public.odalar where id = p_oda for update;
  if not found then return; end if;
  if r.durum = 'oyunda' then raise exception 'Oyun sürerken odadan ayrılamazsın'; end if;
  delete from public.oda_oyunculari where oda_id = p_oda and kullanici_id = auth.uid();
  if not exists (select 1 from public.oda_oyunculari where oda_id = p_oda) then
    delete from public.odalar where id = p_oda;
  elsif r.kurucu = auth.uid() then
    select kullanici_id into v_yeni from public.oda_oyunculari where oda_id = p_oda order by katilma limit 1;
    update public.odalar set kurucu = v_yeni, surum = surum + 1 where id = p_oda;
  else
    update public.odalar set surum = surum + 1 where id = p_oda;
  end if;
end;
$$;

create or replace function public.oda_at(p_oda uuid, p_kullanici uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.odalar%rowtype;
begin
  select * into r from public.odalar where id = p_oda for update;
  if not found or r.kurucu <> auth.uid() then raise exception 'Bunu yalnızca oda kurucusu yapabilir'; end if;
  if r.durum <> 'bekleme' then raise exception 'Oyun başladıktan sonra oyuncu çıkarılamaz'; end if;
  if p_kullanici = auth.uid() then raise exception 'Kendini çıkaramazsın'; end if;
  delete from public.oda_oyunculari where oda_id = p_oda and kullanici_id = p_kullanici;
  update public.odalar set surum = surum + 1 where id = p_oda;
end;
$$;

-- Kurucu odayı başka bir oyuncuya devreder (yönetici yapma).
create or replace function public.oda_kurucu_yap(p_oda uuid, p_kullanici uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.odalar%rowtype;
begin
  select * into r from public.odalar where id = p_oda for update;
  if not found or r.kurucu <> auth.uid() then raise exception 'Bunu yalnızca oda kurucusu yapabilir'; end if;
  if not exists (select 1 from public.oda_oyunculari where oda_id = p_oda and kullanici_id = p_kullanici) then
    raise exception 'Bu kişi odada değil';
  end if;
  update public.odalar set kurucu = p_kullanici, surum = surum + 1 where id = p_oda;
end;
$$;

create or replace function public.oyunu_baslat(p_oda uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.odalar%rowtype; n int; v_boyut int; v_tahta text[]; v_adlar jsonb; s jsonb;
begin
  select * into r from public.odalar where id = p_oda for update;
  if not found or r.kurucu <> auth.uid() then raise exception 'Oyunu yalnızca oda kurucusu başlatabilir'; end if;
  if r.durum <> 'bekleme' then raise exception 'Oyun zaten başlamış'; end if;
  select count(*) into n from public.oda_oyunculari where oda_id = p_oda;
  if n < 2 then raise exception 'Başlamak için en az 2 oyuncu gerekir'; end if;
  if n > 8 then raise exception 'En fazla 8 oyuncu olabilir'; end if;

  -- koltukları rastgele dağıt
  update public.oda_oyunculari o set sira = x.rn - 1
  from (select kullanici_id, row_number() over (order by random()) as rn
        from public.oda_oyunculari where oda_id = p_oda) x
  where o.oda_id = p_oda and o.kullanici_id = x.kullanici_id;
  select jsonb_agg(ad order by sira) into v_adlar from public.oda_oyunculari where oda_id = p_oda;

  v_boyut := case when n > 4 then n else 4 end;
  v_tahta := public.mh_tahta(v_boyut);
  s := jsonb_build_object(
    'boyut', v_boyut, 'oyuncular', v_adlar, 'sira', 0, 'faz', 'oyun',
    'test_yapildi', false, 'tas_kondu', false, 'zorunlu', false, 'pas_serisi', 0,
    'bayraklar', '{}'::jsonb, 'testler', '{}'::jsonb, 'iddia', null, 'itiraz', null, 'bekleyen', null,
    'olay', jsonb_build_object('id', r.surum + 1, 'tur', 'basla'), 'bitti', false);
  update public.oda_gizli set tahta = v_tahta, bonus = array_fill(0, array[n]),
    bekleyen_gercek = null, iddia_gercek = null, iddia_blof = null where oda_id = p_oda;
  update public.odalar set durum = 'oyunda', durum_json = s, surum = surum + 1 where id = p_oda;
  return public.mh_oda_json(p_oda);
end;
$$;

-- Bitmiş odayı yeni oyun için bekleme durumuna al.
create or replace function public.oda_yeniden(p_oda uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.odalar%rowtype;
begin
  select * into r from public.odalar where id = p_oda for update;
  if not found or r.kurucu <> auth.uid() then raise exception 'Bunu yalnızca oda kurucusu yapabilir'; end if;
  if r.durum <> 'bitti' then raise exception 'Oyun henüz bitmedi'; end if;
  update public.oda_oyunculari set sira = null where oda_id = p_oda;
  update public.odalar set durum = 'bekleme', durum_json = '{}'::jsonb, surum = surum + 1 where id = p_oda;
  return public.mh_oda_json(p_oda);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Hamleler (sunucu yetkili)
-- -----------------------------------------------------------------------------
-- Ortak ön kontrol: oda satırı çağıran tarafından kilitlenmiştir (for update);
-- burada oyunun sürdüğü ve çağıranın oyuncu olduğu doğrulanır, koltuk no döner.
create or replace function public.mh_kontrol(p_r public.odalar) returns int
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sira int;
begin
  if p_r.id is null then raise exception 'Oda bulunamadı'; end if;
  if p_r.durum <> 'oyunda' then raise exception 'Oyun şu an sürmüyor'; end if;
  select sira into v_sira from public.oda_oyunculari where oda_id = p_r.id and kullanici_id = auth.uid();
  if v_sira is null then raise exception 'Bu odanın oyuncusu değilsin'; end if;
  return v_sira;
end;
$$;

create or replace function public.hamle_test(p_oda uuid, p_hucre int, p_arac text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.odalar%rowtype; v_sira int; s jsonb; g public.oda_gizli%rowtype; v_gercek text;
  v_olay jsonb;
begin
  select * into r from public.odalar where id = p_oda for update;
  v_sira := public.mh_kontrol(r);
  s := r.durum_json;
  if (s ->> 'sira')::int <> v_sira then raise exception 'Sıra sende değil'; end if;
  if s ->> 'faz' <> 'oyun' then raise exception 'Önce açık kararı tamamla'; end if;
  if (s ->> 'zorunlu')::boolean then raise exception 'Zorunlu tespit turunda test yapılmaz'; end if;
  if (s ->> 'test_yapildi')::boolean then raise exception 'Bu turda zaten test yaptın'; end if;
  if p_arac not in ('Fe', 'N') then raise exception 'Geçersiz test aracı'; end if;
  if p_hucre is null or p_hucre < 0 or p_hucre >= (s ->> 'boyut')::int ^ 2 then raise exception 'Geçersiz kare'; end if;
  if s -> 'bayraklar' ? (p_hucre::text) then raise exception 'Bu kare kilitli, test gerekmez'; end if;

  select * into g from public.oda_gizli where oda_id = p_oda;
  v_gercek := public.mh_tepki(p_arac, g.tahta[p_hucre + 1]);
  s := jsonb_set(s, '{test_yapildi}', 'true'::jsonb);

  if not r.blof then
    s := public.mh_kayit(s, p_hucre, v_sira, p_arac, v_gercek);
    s := jsonb_set(s, '{olay}', jsonb_build_object('id', r.surum + 1, 'tur', 'test', 'oyuncu', v_sira,
           'hucre', p_hucre, 'arac', p_arac, 'sonuc', v_gercek));
    if (s ->> 'tas_kondu')::boolean then s := public.mh_tur_bitir(s, r.blof); end if;
  else
    s := s || jsonb_build_object('faz', 'aciklama', 'bekleyen', jsonb_build_object('hucre', p_hucre, 'arac', p_arac),
           'olay', jsonb_build_object('id', r.surum + 1, 'tur', 'test', 'oyuncu', v_sira,
                    'hucre', p_hucre, 'arac', p_arac, 'sonuc', null));
    update public.oda_gizli set bekleyen_gercek = v_gercek where oda_id = p_oda;
  end if;
  update public.odalar set durum_json = s, surum = surum + 1 where id = p_oda;
  return jsonb_build_object('sonuc', v_gercek, 'oda', public.mh_oda_json(p_oda));
end;
$$;

-- Blöf modunda: test eden gerçek tepkiyi doğru ya da yanlış açıklar.
create or replace function public.hamle_acikla(p_oda uuid, p_soz text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.odalar%rowtype; v_sira int; s jsonb; g public.oda_gizli%rowtype; b jsonb; v_idx int;
begin
  select * into r from public.odalar where id = p_oda for update;
  v_sira := public.mh_kontrol(r);
  s := r.durum_json;
  if (s ->> 'sira')::int <> v_sira or s ->> 'faz' <> 'aciklama' then raise exception 'Şu an açıklama yapamazsın'; end if;
  if p_soz not in ('cekme', 'itme', 'yok') then raise exception 'Geçersiz tepki'; end if;
  select * into g from public.oda_gizli where oda_id = p_oda;
  b := s -> 'bekleyen';
  s := public.mh_kayit(s, (b ->> 'hucre')::int, v_sira, b ->> 'arac', p_soz);
  v_idx := jsonb_array_length(s -> 'testler' -> (b ->> 'hucre')) - 1;
  s := s || jsonb_build_object('faz', 'oyun', 'bekleyen', null,
         'iddia', jsonb_build_object('hucre', (b ->> 'hucre')::int, 'arac', b ->> 'arac', 'soz', p_soz,
                                      'oyuncu', v_sira, 'idx', v_idx),
         'olay', jsonb_build_object('id', r.surum + 1, 'tur', 'acikla', 'oyuncu', v_sira,
                  'hucre', (b ->> 'hucre')::int, 'arac', b ->> 'arac', 'soz', p_soz));
  update public.oda_gizli set iddia_gercek = g.bekleyen_gercek, iddia_blof = (p_soz <> g.bekleyen_gercek),
    bekleyen_gercek = null where oda_id = p_oda;
  if (s ->> 'tas_kondu')::boolean then s := public.mh_tur_bitir(s, r.blof); end if;
  update public.odalar set durum_json = s, surum = surum + 1 where id = p_oda;
  return public.mh_oda_json(p_oda);
end;
$$;

-- Test edenin kendi gerçek sonucu (sayfa yenilenirse tekrar görebilsin diye).
create or replace function public.hamle_ozel(p_oda uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.odalar%rowtype; g public.oda_gizli%rowtype; s jsonb; v_sira int;
begin
  select * into r from public.odalar where id = p_oda;
  v_sira := (select sira from public.oda_oyunculari where oda_id = p_oda and kullanici_id = auth.uid());
  if v_sira is null or not found then return null; end if;
  s := r.durum_json;
  if s ->> 'faz' = 'aciklama' and (s ->> 'sira')::int = v_sira then
    select * into g from public.oda_gizli where oda_id = p_oda;
    return jsonb_build_object('hucre', s -> 'bekleyen' -> 'hucre', 'arac', s -> 'bekleyen' -> 'arac',
                              'gercek', g.bekleyen_gercek);
  end if;
  return null;
end;
$$;

create or replace function public.hamle_tas(p_oda uuid, p_hucre int, p_sym text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.odalar%rowtype; v_sira int; s jsonb; g public.oda_gizli%rowtype;
  v_boyut int; v_kullanilan int; v_limit int; p int[]; v_say int; v_mac uuid := gen_random_uuid();
begin
  select * into r from public.odalar where id = p_oda for update;
  v_sira := public.mh_kontrol(r);
  s := r.durum_json;
  v_boyut := (s ->> 'boyut')::int;
  if (s ->> 'sira')::int <> v_sira then raise exception 'Sıra sende değil'; end if;
  if s ->> 'faz' <> 'oyun' then raise exception 'Önce açık kararı tamamla'; end if;
  if (s ->> 'tas_kondu')::boolean then raise exception 'Bu turda zaten taş koydun'; end if;
  if p_sym not in ('N', 'S', 'Fe', 'Cu') then raise exception 'Geçersiz taş'; end if;
  if p_hucre is null or p_hucre < 0 or p_hucre >= v_boyut ^ 2 then raise exception 'Geçersiz kare'; end if;
  if s -> 'bayraklar' ? (p_hucre::text) then raise exception 'Bu kare kilitli, taş konamaz'; end if;
  v_limit := (public.mh_dagilim(v_boyut) ->> p_sym)::int;
  select count(*) into v_kullanilan from jsonb_each(s -> 'bayraklar')
    where (value ->> 'o')::int = v_sira and value ->> 's' = p_sym;
  if v_kullanilan >= v_limit then raise exception '% taşların bitti', p_sym; end if;

  s := jsonb_set(s, array['bayraklar', p_hucre::text], jsonb_build_object('o', v_sira, 's', p_sym), true);
  s := jsonb_set(s, '{tas_kondu}', 'true'::jsonb);
  s := jsonb_set(s, '{olay}', jsonb_build_object('id', r.surum + 1, 'tur', 'tas', 'oyuncu', v_sira,
         'hucre', p_hucre, 'tas', p_sym));

  select count(*) into v_say from jsonb_object_keys(s -> 'bayraklar');
  if v_say = v_boyut ^ 2 then
    select * into g from public.oda_gizli where oda_id = p_oda;
    p := public.mh_puanlar(s, g.tahta, g.bonus);
    s := s || jsonb_build_object('bitti', true, 'faz', 'bitti', 'tahta', to_jsonb(g.tahta), 'puanlar', to_jsonb(p));
    update public.odalar set durum = 'bitti', durum_json = s, surum = surum + 1 where id = p_oda;
    -- sıralama için sonuçları kaydet (beraberlikte en yüksek puanı alanların hepsi kazanmış sayılır)
    insert into public.mac_sonuclari (mac_id, oda_kod, kullanici_id, ad, puan, kazandi, oyuncu_sayisi, blof)
    select v_mac, r.kod, o.kullanici_id, o.ad, p[o.sira + 1],
           p[o.sira + 1] = (select max(x) from unnest(p) x), array_length(p, 1), r.blof
    from public.oda_oyunculari o where o.oda_id = p_oda and o.sira is not null;
  else
    if (s ->> 'test_yapildi')::boolean or (s ->> 'zorunlu')::boolean then
      s := public.mh_tur_bitir(s, r.blof);
    end if;
    update public.odalar set durum_json = s, surum = surum + 1 where id = p_oda;
  end if;
  return public.mh_oda_json(p_oda);
end;
$$;

create or replace function public.hamle_pas(p_oda uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.odalar%rowtype; v_sira int; s jsonb;
begin
  select * into r from public.odalar where id = p_oda for update;
  v_sira := public.mh_kontrol(r);
  s := r.durum_json;
  if (s ->> 'sira')::int <> v_sira then raise exception 'Sıra sende değil'; end if;
  if s ->> 'faz' <> 'oyun' then raise exception 'Önce açık kararı tamamla'; end if;
  if (s ->> 'zorunlu')::boolean then raise exception 'Zorunlu tespit turunda pas geçilmez'; end if;
  if not (s ->> 'test_yapildi')::boolean then raise exception 'Önce bir test yapmalısın'; end if;
  s := jsonb_set(s, '{olay}', jsonb_build_object('id', r.surum + 1, 'tur', 'pas', 'oyuncu', v_sira));
  s := public.mh_tur_bitir(s, r.blof);
  update public.odalar set durum_json = s, surum = surum + 1 where id = p_oda;
  return public.mh_oda_json(p_oda);
end;
$$;

-- Blöf modunda: önceki oyuncunun açıklamasına itiraz et ya da kabul et.
create or replace function public.hamle_itiraz(p_oda uuid, p_itiraz boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.odalar%rowtype; v_sira int; s jsonb; g public.oda_gizli%rowtype; c jsonb;
  v_test int; v_bonus int[]; v_sonuc text;
begin
  select * into r from public.odalar where id = p_oda for update;
  v_sira := public.mh_kontrol(r);
  s := r.durum_json;
  if (s ->> 'sira')::int <> v_sira or s ->> 'faz' <> 'itiraz' then raise exception 'Şu an itiraz kararı yok'; end if;
  select * into g from public.oda_gizli where oda_id = p_oda;
  c := s -> 'itiraz';
  v_bonus := g.bonus;
  if not p_itiraz then
    v_sonuc := 'kabul';
  elsif g.iddia_blof then
    v_bonus[(c ->> 'oyuncu')::int + 1] := v_bonus[(c ->> 'oyuncu')::int + 1] - 10;
    v_bonus[v_sira + 1] := v_bonus[v_sira + 1] + 10;
    s := jsonb_set(s, array['testler', c ->> 'hucre', c ->> 'idx', 'r'], to_jsonb(g.iddia_gercek));
    s := jsonb_set(s, array['testler', c ->> 'hucre', c ->> 'idx', 'ifsa'], 'true'::jsonb);
    v_sonuc := 'yakalandi';
  else
    v_bonus[v_sira + 1] := v_bonus[v_sira + 1] - 10;
    s := jsonb_set(s, array['testler', c ->> 'hucre', c ->> 'idx', 'onay'], 'true'::jsonb);
    v_sonuc := 'bos';
  end if;
  s := s || jsonb_build_object('faz', 'oyun', 'itiraz', null,
         'olay', jsonb_build_object('id', r.surum + 1, 'tur', 'itiraz', 'oyuncu', v_sira,
                  'hedef', (c ->> 'oyuncu')::int, 'hucre', (c ->> 'hucre')::int, 'arac', c ->> 'arac',
                  'sonuc', v_sonuc, 'gercek', case when v_sonuc = 'yakalandi' then g.iddia_gercek else null end));
  update public.oda_gizli set bonus = v_bonus where oda_id = p_oda;
  update public.odalar set durum_json = s, surum = surum + 1 where id = p_oda;
  return public.mh_oda_json(p_oda);
end;
$$;

-- Kurucu: bağlantısı kopan oyuncunun sırasını geçer (oyun takılmasın diye).
create or replace function public.hamle_sira_gec(p_oda uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.odalar%rowtype; v_sira int; s jsonb;
begin
  select * into r from public.odalar where id = p_oda for update;
  v_sira := public.mh_kontrol(r);
  if r.kurucu <> auth.uid() then raise exception 'Sırayı yalnızca oda kurucusu geçebilir'; end if;
  s := r.durum_json;
  if s ->> 'faz' = 'aciklama' then
    update public.oda_gizli set bekleyen_gercek = null where oda_id = p_oda;
    s := s || jsonb_build_object('faz', 'oyun', 'bekleyen', null);
  end if;
  s := jsonb_set(s, '{olay}', jsonb_build_object('id', r.surum + 1, 'tur', 'gecildi', 'oyuncu', (s ->> 'sira')::int));
  s := public.mh_tur_bitir(s, r.blof);
  update public.odalar set durum_json = s, surum = surum + 1 where id = p_oda;
  return public.mh_oda_json(p_oda);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7b) Sıralama
-- -----------------------------------------------------------------------------
-- Sıralama: önce galibiyet sayısı, eşitlikte ortalama puan, sonra maç sayısı.
create or replace function public.siralama(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_onayli() then raise exception 'Hesabın henüz onaylanmadı'; end if;
  return jsonb_build_object(
    'benim_id', auth.uid(),
    'tablo', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.galibiyet desc, t.ortalama desc, t.mac desc, t.ad)
      from (
        select m.kullanici_id as id,
               coalesce(max(p.gorunen_ad), max(m.ad)) as ad,
               count(*)::int as mac,
               sum(case when m.kazandi then 1 else 0 end)::int as galibiyet,
               round(avg(m.puan)::numeric, 1) as ortalama,
               max(m.puan)::int as en_yuksek
        from public.mac_sonuclari m
        left join public.profiller p on p.id = m.kullanici_id
        group by m.kullanici_id
        order by sum(case when m.kazandi then 1 else 0 end) desc, avg(m.puan) desc, count(*) desc
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) t
    ), '[]'::jsonb));
end;
$$;

-- Son oynanan maçlar (oyuncular puana göre sıralı)
create or replace function public.son_maclar(p_limit int default 10) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_onayli() then raise exception 'Hesabın henüz onaylanmadı'; end if;
  return coalesce((
    select jsonb_agg(x order by x.bitis desc)
    from (
      select m.mac_id, max(m.bitis) as bitis, max(m.oda_kod) as oda_kod, bool_or(m.blof) as blof,
             jsonb_agg(jsonb_build_object('ad', m.ad, 'puan', m.puan, 'kazandi', m.kazandi) order by m.puan desc, m.ad) as oyuncular
      from public.mac_sonuclari m
      group by m.mac_id
      order by max(m.bitis) desc
      limit greatest(1, least(coalesce(p_limit, 10), 50))
    ) x
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) Yetkiler: tarayıcı yalnızca bu fonksiyonları çağırabilir
-- -----------------------------------------------------------------------------
revoke all on function
  public.ben(), public.kod_gecerli(text),
  public.admin_kullanicilar(), public.admin_onayla(uuid, boolean), public.admin_rol(uuid, text),
  public.admin_sil(uuid), public.admin_kodlar(), public.admin_kod_olustur(text, int, int),
  public.admin_kod_kapat(text),
  public.mh_oda_json(uuid), public.oda_getir(uuid, int), public.odalarim(),
  public.oda_kur(boolean), public.odaya_katil(text), public.odadan_ayril(uuid),
  public.oda_at(uuid, uuid), public.oda_kurucu_yap(uuid, uuid), public.oyunu_baslat(uuid),
  public.oda_yeniden(uuid), public.mh_kontrol(public.odalar),
  public.hamle_test(uuid, int, text), public.hamle_acikla(uuid, text), public.hamle_ozel(uuid),
  public.hamle_tas(uuid, int, text), public.hamle_pas(uuid), public.hamle_itiraz(uuid, boolean),
  public.hamle_sira_gec(uuid), public.siralama(int), public.son_maclar(int)
from public, anon;

grant execute on function
  public.ben(), public.kod_gecerli(text),
  public.admin_kullanicilar(), public.admin_onayla(uuid, boolean), public.admin_rol(uuid, text),
  public.admin_sil(uuid), public.admin_kodlar(), public.admin_kod_olustur(text, int, int),
  public.admin_kod_kapat(text),
  public.oda_getir(uuid, int), public.odalarim(),
  public.oda_kur(boolean), public.odaya_katil(text), public.odadan_ayril(uuid),
  public.oda_at(uuid, uuid), public.oda_kurucu_yap(uuid, uuid), public.oyunu_baslat(uuid),
  public.oda_yeniden(uuid),
  public.hamle_test(uuid, int, text), public.hamle_acikla(uuid, text), public.hamle_ozel(uuid),
  public.hamle_tas(uuid, int, text), public.hamle_pas(uuid), public.hamle_itiraz(uuid, boolean),
  public.hamle_sira_gec(uuid), public.siralama(int), public.son_maclar(int)
to authenticated;

-- İç yardımcılar tarayıcıdan çağrılamaz (yalnızca diğer fonksiyonlar kullanır)
revoke all on function public.mh_oda_json(uuid), public.mh_kontrol(public.odalar) from authenticated;

-- Kayıt formu davet kodunu girişten önce doğrulayabilsin
grant execute on function public.kod_gecerli(text) to anon;

-- =============================================================================
-- İLK YÖNETİCİ (bu komut dosyanın parçası DEĞİLDİR; ilk kayıttan sonra elle çalıştırın)
-- =============================================================================
-- Önce uygulamadan normal kayıt olun, sonra SQL Editor'de kendi e-postanızla:
--
--   update public.profiller set rol = 'yonetici', onayli = true
--   where id = (select id from auth.users where email = 'SIZIN@EPOSTANIZ.COM');
--
-- (Kullanıcı adıyla kayıt olduysanız e-posta yerine 'KULLANICIADINIZ@oyuncu.manyetik.invalid' yazın.)
-- =============================================================================
