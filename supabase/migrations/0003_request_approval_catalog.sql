-- =============================================================================
-- 0003_request_approval_catalog.sql
--   1) Buyer request -> seller approval flow: add pay_token; new default status
--   2) Seller catalog: catalog_items table + RLS + public slug lookup RPC
-- Money is INTEGER rupiah (bigint), consistent with 0001.
-- =============================================================================

-- ---- jastip_orders: pay_token + new default -------------------------------
-- pay_token is an unguessable handle the buyer keeps. It names the Realtime
-- Broadcast channel the buyer subscribes to (order:<pay_token>) and the public
-- /pay/<pay_token> page. Unguessable => it is the security boundary, like
-- confirm_token.
alter table public.jastip_orders
  add column if not exists pay_token text unique;
create index if not exists jastip_orders_pay_token_idx
  on public.jastip_orders (pay_token);

-- New orders now start awaiting seller approval, not payment.
alter table public.jastip_orders
  alter column status set default 'pending_approval';

-- ---- catalog_items ---------------------------------------------------------
create table if not exists public.catalog_items (
  id           uuid primary key default gen_random_uuid(),
  streamer_id  uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  description  text,
  image_url    text,
  price        bigint check (price is null or price > 0), -- suggested price, optional
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists catalog_items_streamer_idx
  on public.catalog_items (streamer_id);

drop trigger if exists catalog_items_set_updated_at on public.catalog_items;
create trigger catalog_items_set_updated_at
  before update on public.catalog_items
  for each row execute function public.set_updated_at();

-- ---- Row Level Security (owner-scoped, mirrors jastip_orders) --------------
alter table public.catalog_items enable row level security;

drop policy if exists catalog_select_own on public.catalog_items;
create policy catalog_select_own on public.catalog_items
  for select to authenticated using (streamer_id = auth.uid());

drop policy if exists catalog_insert_own on public.catalog_items;
create policy catalog_insert_own on public.catalog_items
  for insert to authenticated with check (streamer_id = auth.uid());

drop policy if exists catalog_update_own on public.catalog_items;
create policy catalog_update_own on public.catalog_items
  for update to authenticated
  using (streamer_id = auth.uid()) with check (streamer_id = auth.uid());

drop policy if exists catalog_delete_own on public.catalog_items;
create policy catalog_delete_own on public.catalog_items
  for delete to authenticated using (streamer_id = auth.uid());

-- ---- Public catalog lookup (safe columns only) -----------------------------
-- SECURITY DEFINER so anon can list a streamer's active catalog by slug WITHOUT
-- a direct SELECT grant on catalog_items. Mirrors get_streamer_by_slug.
create or replace function public.get_catalog_by_slug(p_slug text)
returns table (
  id uuid,
  name text,
  description text,
  image_url text,
  price bigint
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.name, c.description, c.image_url, c.price
  from public.catalog_items c
  join public.profiles p on p.id = c.streamer_id
  where p.slug = p_slug and c.is_active = true
  order by c.sort_order asc, c.created_at desc;
$$;

revoke all on function public.get_catalog_by_slug(text) from public;
grant execute on function public.get_catalog_by_slug(text) to anon, authenticated;

-- NOTE: catalog images reuse the existing public `item-images` bucket
-- (authenticated insert is already allowed in 0001) — no new bucket needed.
