-- ===========================================================================
-- HATIRLATICI UYGULAMASI — ÜRETİM VERİTABANI ŞEMASI (SUPABASE POSTGRESQL)
-- ===========================================================================
-- Bu betik Supabase Dashboard -> SQL Editor alanında bir kez çalıştırılır.
-- Idempotent (tekrar çalıştırılabilir) ve hataya dayanıklı olarak tasarlanmıştır.

-- 1. PROFİLLER TABLOSU
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  surname text not null default '',
  username text not null,
  gender text check (gender in ('kadin', 'erkek', 'belirtmek_istemiyorum')),
  avatar_uri text,
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- 2. KULLANICI DURUMU (HEDEFLER, SU, DÖNGÜ, SKOR, KOÇ VERİLERİ)
create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goals jsonb not null default '[]'::jsonb,
  score integer not null default 0,
  profile_key text,
  water_settings jsonb,
  water_day jsonb,
  cycle jsonb,
  coach_threads jsonb,
  updated_at timestamptz not null default now()
);

-- 3. GÜNCELLENME ZAMANI TETİKLEYİCİSİ (TOUCH UPDATED_AT)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists user_state_touch_updated_at on public.user_state;
create trigger user_state_touch_updated_at
  before update on public.user_state
  for each row execute function public.touch_updated_at();

-- 4. YENİ KULLANICI KAYIT TETİKLEYİCİSİ (ÇÖKMEYE KARŞI KORUMALI)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  next_gender text := nullif(meta->>'gender', '');
  next_username text := nullif(trim(meta->>'username'), '');
begin
  -- Cinsiyet doğrulaması
  if next_gender is not null and next_gender not in ('kadin', 'erkek', 'belirtmek_istemiyorum') then
    next_gender := null;
  end if;

  -- Kullanıcı adı boşsa e-postadan üret
  if next_username is null then
    next_username := split_part(coalesce(new.email, 'kullanici'), '@', 1);
  end if;

  -- Kullanıcı adı çakışmasını engelle (trigger asla patlamasın)
  if exists (select 1 from public.profiles where lower(username) = lower(next_username) and id <> new.id) then
    next_username := next_username || '_' || floor(random() * 9000 + 1000)::text;
  end if;

  -- Profil satırını ekle veya güncelle
  insert into public.profiles (id, name, surname, username, gender)
  values (
    new.id,
    coalesce(nullif(trim(meta->>'name'), ''), 'Kullanıcı'),
    coalesce(meta->>'surname', ''),
    next_username,
    next_gender
  )
  on conflict (id) do update set
    name = excluded.name,
    surname = excluded.surname,
    username = excluded.username,
    gender = excluded.gender,
    updated_at = now();

  -- Durum satırını ekle (yoksa)
  insert into public.user_state (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. KULLANICI ADI KULLANILMIŞ MI KONTROLÜ (RPC)
create or replace function public.is_username_taken(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where lower(username) = lower(trim(candidate))
  );
$$;

-- 6. GİRİŞ İÇİN E-POSTA BULUCU (RPC - Kullanıcı Adı veya E-posta ile Giriş)
create or replace function public.email_for_login(identifier text)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  needle text := lower(trim(coalesce(identifier, '')));
  result text;
begin
  if length(needle) < 3 or length(needle) > 320 then
    return null;
  end if;

  select u.email
    into result
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = needle
     or (p.username is not null and lower(p.username) = needle)
  limit 1;

  return result;
end;
$$;

-- 7. SATIR DÜZEYİ GÜVENLİK (ROW LEVEL SECURITY - RLS)
alter table public.profiles enable row level security;
alter table public.user_state enable row level security;

-- Profiles Yetkileri
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

-- User State Yetkileri
drop policy if exists user_state_select_own on public.user_state;
create policy user_state_select_own
  on public.user_state
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_state_update_own on public.user_state;
create policy user_state_update_own
  on public.user_state
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_state_insert_own on public.user_state;
create policy user_state_insert_own
  on public.user_state
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- 8. GENEL İZİNLER
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.user_state to authenticated;
grant execute on function public.is_username_taken(text) to anon, authenticated;
grant execute on function public.email_for_login(text) to anon, authenticated;

-- 9. HESAP SİLME FONKSİYONU (APPLE GUIDELINE 5.1.1v - ACCOUNT DELETION)
create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_user_account() to authenticated;

-- 10. YÖNETİCİ KULLANICI LİSTESİ (ADMIN USERS DIRECTORY)
create or replace function public.get_admin_users()
returns table (
  id uuid,
  name text,
  surname text,
  username text,
  gender text,
  score integer,
  goals_count integer,
  profile_key text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return query
  select
    p.id,
    p.name,
    p.surname,
    p.username,
    p.gender,
    coalesce(s.score, 0) as score,
    coalesce(jsonb_array_length(s.goals), 0)::integer as goals_count,
    s.profile_key,
    p.updated_at
  from public.profiles p
  left join public.user_state s on s.user_id = p.id
  order by p.updated_at desc
  limit 100;
end;
$$;

grant execute on function public.get_admin_users() to authenticated, anon;

-- 11. YÖNETİCİ KULLANICI DETAY İNCELEME (ADMIN USER INSPECTION)
create or replace function public.get_admin_user_details(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'surname', p.surname,
    'username', p.username,
    'gender', p.gender,
    'score', coalesce(s.score, 0),
    'goals', coalesce(s.goals, '[]'::jsonb),
    'profile_key', s.profile_key,
    'water_settings', s.water_settings,
    'updated_at', p.updated_at
  ) into result
  from public.profiles p
  left join public.user_state s on s.user_id = p.id
  where p.id = target_user_id;

  return result;
end;
$$;

grant execute on function public.get_admin_user_details(uuid) to authenticated, anon;


