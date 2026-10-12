-- DMMR POS analytics schema (initial foundation)
-- Apply in the dedicated Supabase project, not Shift or FutsalKita.
-- RLS is enabled and no public policies are created here intentionally.

create extension if not exists pgcrypto;

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  loyverse_receipt_id text not null unique,
  receipt_number text,
  receipt_date timestamptz,
  receipt_type text,
  total_money numeric(14,2) not null default 0,
  total_tax numeric(14,2) not null default 0,
  total_discount numeric(14,2) not null default 0,
  total_tendered numeric(14,2) not null default 0,
  store_id text,
  store_name text,
  pos_device_id text,
  pos_device_name text,
  employee_id text,
  employee_name text,
  customer_id text,
  customer_name text,
  source_updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receipts_receipt_date_idx on public.receipts (receipt_date);
create index if not exists receipts_store_date_idx on public.receipts (store_id, receipt_date);

create table if not exists public.sales_items (
  id uuid primary key default gen_random_uuid(),
  loyverse_line_item_key text not null unique,
  loyverse_receipt_id text not null references public.receipts(loyverse_receipt_id) on update cascade on delete cascade,
  item_id text,
  variant_id text,
  item_name text,
  variant_name text,
  sku text,
  quantity numeric(14,3) not null default 0,
  price numeric(14,2) not null default 0,
  gross_total_money numeric(14,2) not null default 0,
  total_money numeric(14,2) not null default 0,
  cost numeric(14,2) not null default 0,
  cost_total numeric(14,2) not null default 0,
  total_discount numeric(14,2) not null default 0,
  line_note text,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_items_receipt_idx on public.sales_items (loyverse_receipt_id);
create index if not exists sales_items_item_name_idx on public.sales_items (item_name);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  loyverse_payment_key text not null unique,
  loyverse_receipt_id text not null references public.receipts(loyverse_receipt_id) on update cascade on delete cascade,
  payment_type_id text,
  payment_type_name text,
  money_amount numeric(14,2) not null default 0,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_receipt_idx on public.payments (loyverse_receipt_id);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'loyverse',
  status text not null check (status in ('running','success','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  receipts_seen integer not null default 0,
  receipts_inserted integer not null default 0,
  receipts_updated integer not null default 0,
  items_upserted integer not null default 0,
  payments_upserted integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

-- Do not expose private sales data through the anonymous API.
alter table public.receipts enable row level security;
alter table public.sales_items enable row level security;
alter table public.payments enable row level security;
alter table public.sync_runs enable row level security;

-- No permissive policies are created until the app's approved-user/auth model is set.
