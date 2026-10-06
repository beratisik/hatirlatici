-- Hatırlatıcı üretim şeması.
-- Supabase SQL Editor'de bir kez çalıştır.
-- Uygulama yalnızca giriş yapmış kullanıcının kendi satırını görür (RLS).

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  next_gender text := nullif(meta->>'gender', '');
  next_username text := nullif(trim(meta->>'username'), '');
begin
  if next_gender is not null and next_gender not in ('kadin', 'erkek', 'belirtmek_istemiyorum') then
    next_gender := null;
  end if;

  if next_username is null then
    next_username := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  insert into public.profiles (id, name, surname, username, gender)
  values (
    new.id,
    coalesce(nullif(trim(meta->>'name'), ''), 'Kullanıcı'),
    coalesce(meta->>'surname', ''),
    next_username,
    next_gender
  );

  insert into public.user_state (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

create or replace function public.email_for_login(identifier text)
returns text
language plpgsql
stable
security definer
set search_path = public
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

alter table public.profiles enable row level security;
alter table public.user_state enable row level security;

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

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.user_state to authenticated;
grant execute on function public.is_username_taken(text) to anon, authenticated;
grant execute on function public.email_for_login(text) to anon, authenticated;
