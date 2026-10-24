-- =====================================================================
-- Prophone Béziers — Supabase schema (PostgreSQL + RLS)
-- Run this whole file once in: Supabase > SQL Editor > New query.
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Admins: only users listed here may write. Sign-ups are disabled in the
-- dashboard, and even a stray account cannot write unless it is in here.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint brands_name_unique unique (name)
);

create table if not exists public.models (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references public.brands(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  image      text check (image is null or char_length(image) <= 500),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint models_brand_name_unique unique (brand_id, name)
);
create index if not exists models_brand_idx on public.models (brand_id, sort_order);

create table if not exists public.repair_types (
  id         uuid primary key default gen_random_uuid(),
  name_fr    text not null check (char_length(name_fr) between 1 and 80),
  name_en    text not null check (char_length(name_en) between 1 and 80),
  icon       text not null default 'wrench',
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint repair_types_name_unique unique (name_fr)
);

create table if not exists public.prices (
  id              uuid primary key default gen_random_uuid(),
  model_id        uuid not null references public.models(id) on delete cascade,
  repair_type_id  uuid not null references public.repair_types(id) on delete cascade,
  price           numeric(8,2) check (price is null or price >= 0),   -- NULL = "Sur devis"
  currency        text not null default 'EUR',
  est_time_minutes integer check (est_time_minutes is null or est_time_minutes > 0),
  is_available    boolean not null default true,
  updated_at      timestamptz not null default now(),
  constraint prices_unique unique (model_id, repair_type_id)
);
create index if not exists prices_model_idx  on public.prices (model_id);
create index if not exists prices_repair_idx on public.prices (repair_type_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists prices_touch on public.prices;
create trigger prices_touch before update on public.prices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Site settings (key / JSON value) — keys used by the site: 'shop', 'promo'
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key check (char_length(key) <= 60),
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Contact messages (public insert only)
-- ---------------------------------------------------------------------
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 100),
  phone      text check (phone is null or char_length(phone) <= 30),
  email      text check (email is null or char_length(email) <= 150),
  model      text check (model is null or char_length(model) <= 100),
  message    text not null check (char_length(message) between 5 and 2000),
  lang       text check (lang in ('fr','en')),
  is_read    boolean not null default false,
  created_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

-- Server-side rate limit: refuse new messages if 10+ arrived in the last
-- 10 minutes. Cheap brake against scripted floods (the form also has a
-- honeypot field and a per-browser cooldown).
create or replace function public.contact_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.contact_messages
       where created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists contact_rate_limit_trg on public.contact_messages;
create trigger contact_rate_limit_trg before insert on public.contact_messages
  for each row execute function public.contact_rate_limit();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.admins           enable row level security;
alter table public.brands           enable row level security;
alter table public.models           enable row level security;
alter table public.repair_types     enable row level security;
alter table public.prices           enable row level security;
alter table public.site_settings    enable row level security;
alter table public.contact_messages enable row level security;

-- admins: a user can only see their own row; nobody can write from the API.
drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Public read of active data
drop policy if exists "brands public read" on public.brands;
create policy "brands public read" on public.brands
  for select to anon, authenticated using (is_active);

drop policy if exists "models public read" on public.models;
create policy "models public read" on public.models
  for select to anon, authenticated using (is_active);

drop policy if exists "repair_types public read" on public.repair_types;
create policy "repair_types public read" on public.repair_types
  for select to anon, authenticated using (is_active);

drop policy if exists "prices public read" on public.prices;
create policy "prices public read" on public.prices
  for select to anon, authenticated using (is_available);

drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read" on public.site_settings
  for select to anon, authenticated using (true);

-- Admin: full access (read inactive rows too, and write)
drop policy if exists "brands admin all" on public.brands;
create policy "brands admin all" on public.brands
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "models admin all" on public.models;
create policy "models admin all" on public.models
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "repair_types admin all" on public.repair_types;
create policy "repair_types admin all" on public.repair_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "prices admin all" on public.prices;
create policy "prices admin all" on public.prices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings admin all" on public.site_settings;
create policy "settings admin all" on public.site_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Contact messages: anyone may insert; only the admin may read / update / delete.
drop policy if exists "contact public insert" on public.contact_messages;
create policy "contact public insert" on public.contact_messages
  for insert to anon, authenticated
  with check (is_read = false);

drop policy if exists "contact admin read" on public.contact_messages;
create policy "contact admin read" on public.contact_messages
  for select to authenticated using (public.is_admin());

drop policy if exists "contact admin update" on public.contact_messages;
create policy "contact admin update" on public.contact_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "contact admin delete" on public.contact_messages;
create policy "contact admin delete" on public.contact_messages
  for delete to authenticated using (public.is_admin());

-- Table privileges (RLS still applies on top of these)
grant usage on schema public to anon, authenticated;
grant select on public.brands, public.models, public.repair_types, public.prices, public.site_settings to anon;
grant insert on public.contact_messages to anon;
grant select, insert, update, delete on
  public.brands, public.models, public.repair_types, public.prices,
  public.site_settings, public.contact_messages to authenticated;
grant select on public.admins to authenticated;

-- =====================================================================
-- AFTER you create the admin user (Authentication > Users > Add user),
-- register it as admin by running this with the real e-mail:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'PROPRIETAIRE@exemple.fr';
--
-- Also: Authentication > Providers > Email > turn OFF "Allow new users to sign up".
-- =====================================================================
