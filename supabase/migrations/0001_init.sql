-- =============================================================================
-- 0001_init.sql — Jastip Live SaaS initial schema
-- Postgres / Supabase. Money is stored as INTEGER rupiah (bigint).
-- =============================================================================

-- gen_random_uuid() is in core PG13+; ensure pgcrypto for safety.
create extension if not exists pgcrypto;

-- ---- Enums -----------------------------------------------------------------
do $$ begin
  create type order_status as enum (
    'pending_payment',
    'held_in_escrow',
    'purchased',
    'completed',
    'cancelled',
    'refunded'
  );
exception when duplicate_object then null; end $$;

-- ---- profiles --------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  display_name          text,
  slug                  text not null unique,
  bank_code             text,
  bank_account_number   text,
  bank_account_holder   text,
  platform_fee_percent  numeric(5,2) not null default 5.0,
  created_at            timestamptz not null default now()
);
create index if not exists profiles_slug_idx on public.profiles (slug);

-- ---- jastip_orders ---------------------------------------------------------
create table if not exists public.jastip_orders (
  id                      uuid primary key default gen_random_uuid(),
  streamer_id             uuid not null references public.profiles(id) on delete cascade,
  viewer_name             text,
  viewer_phone            text,
  item_name               text not null,
  item_description        text,
  item_image_url          text,
  receipt_image_url       text,
  amount_budget           bigint not null check (amount_budget > 0),
  platform_fee            bigint not null,
  streamer_payout_amount  bigint not null,
  status                  order_status not null default 'pending_payment',
  payout_status           text check (payout_status in ('processing','completed','failed')),
  iris_reference_no       text,
  confirm_token           text unique,
  purchased_at            timestamptz,
  midtrans_order_id       text not null unique,
  midtrans_snap_token     text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint fee_split_balances
    check (platform_fee + streamer_payout_amount = amount_budget)
);
create index if not exists jastip_orders_streamer_idx on public.jastip_orders (streamer_id);
create index if not exists jastip_orders_midtrans_idx on public.jastip_orders (midtrans_order_id);
create index if not exists jastip_orders_confirm_token_idx on public.jastip_orders (confirm_token);
create index if not exists jastip_orders_status_purchased_idx
  on public.jastip_orders (status, purchased_at);

-- ---- updated_at trigger ----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jastip_orders_set_updated_at on public.jastip_orders;
create trigger jastip_orders_set_updated_at
  before update on public.jastip_orders
  for each row execute function public.set_updated_at();

-- ---- Row Level Security ----------------------------------------------------
alter table public.profiles enable row level security;
alter table public.jastip_orders enable row level security;

-- profiles: a streamer can read/insert/update ONLY their own row.
-- Bank details are sensitive, so anon has no direct table access; public
-- lookups go through get_streamer_by_slug() below.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- jastip_orders: a streamer can read/update ONLY their own orders.
-- Inserts (from anonymous buyers) and webhook/escrow writes go through the
-- service-role client, which bypasses RLS. No anon table access at all.
drop policy if exists orders_select_own on public.jastip_orders;
create policy orders_select_own on public.jastip_orders
  for select to authenticated using (streamer_id = auth.uid());

drop policy if exists orders_update_own on public.jastip_orders;
create policy orders_update_own on public.jastip_orders
  for update to authenticated using (streamer_id = auth.uid()) with check (streamer_id = auth.uid());

-- ---- Public streamer lookup (safe columns only) ----------------------------
-- SECURITY DEFINER so anon can resolve a slug -> public profile WITHOUT any
-- direct SELECT grant on profiles (never exposes bank details).
create or replace function public.get_streamer_by_slug(p_slug text)
returns table (
  id uuid,
  display_name text,
  slug text,
  platform_fee_percent numeric
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.slug, p.platform_fee_percent
  from public.profiles p
  where p.slug = p_slug;
$$;

revoke all on function public.get_streamer_by_slug(text) from public;
grant execute on function public.get_streamer_by_slug(text) to anon, authenticated;

-- ---- Realtime --------------------------------------------------------------
-- NOTE: postgres_changes ships the FULL row. The public overlay must NOT get a
-- direct anon SELECT policy (it would leak viewer_phone). The overlay instead
-- subscribes to Realtime Broadcast on a per-streamer channel, and the webhook
-- (server) publishes only non-PII fields. Publication is enabled here for the
-- authenticated dashboard's own realtime needs.
do $$ begin
  alter publication supabase_realtime add table public.jastip_orders;
exception when duplicate_object then null; end $$;

-- ---- Storage buckets + policies --------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('item-images', 'item-images', true, 5242880,
   array['image/jpeg','image/png','image/webp']),
  ('receipts', 'receipts', true, 5242880,
   array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- item-images: anonymous buyers may upload; anyone may read (public bucket).
drop policy if exists item_images_anon_insert on storage.objects;
create policy item_images_anon_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'item-images');

drop policy if exists item_images_public_read on storage.objects;
create policy item_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'item-images');

-- receipts: only authenticated streamers upload; anyone may read via link.
drop policy if exists receipts_auth_insert on storage.objects;
create policy receipts_auth_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts');

drop policy if exists receipts_public_read on storage.objects;
create policy receipts_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'receipts');
