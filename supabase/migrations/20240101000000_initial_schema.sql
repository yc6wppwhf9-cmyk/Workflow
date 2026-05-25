-- ============================================================
-- Migration: Initial schema — enums, core tables, triggers
-- ============================================================

create extension if not exists "uuid-ossp";

-- Enums

create type user_role as enum (
  'admin', 'design', 'merchandising', 'bom', 'marketing', 'sales', 'viewer'
);

create type workflow_stage as enum (
  'draft',
  'design_completed',
  'merchandising_completed',
  'bom_finalized',
  'marketing_ready',
  'sales_priced',
  'product_live'
);

-- Profiles (extends Supabase auth.users)

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role        user_role not null default 'viewer',
  department  text,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Products

create table products (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  sku             text unique not null,
  category        text not null default 'junior-backpacks',
  brand           text,
  description     text,
  workflow_stage  workflow_stage not null default 'draft',
  is_locked       boolean not null default false,
  created_by      uuid references profiles(id),
  updated_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Design data

create table design_data (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references products(id) on delete cascade,
  channel         text,
  designer_name   text,
  sample_color    text,
  color_skus      text[],
  unique_feature  text,
  farma           text,
  season_year     text,
  fabric          text,
  lining          text,
  air_mesh        text,
  zipper          text,
  puller          text,
  patta_9mm       text,
  patta_1         text,
  patta_2         text,
  lader_lock      text,
  branding        text,
  screen_print    text,
  digital_print   text,
  bartech         text,
  re_sampling_by  text,
  remarks         text,
  add_on_1        text,
  add_on_2        text,
  add_on_3        text,
  designer_sign   text,
  is_completed    boolean not null default false,
  is_locked       boolean not null default false,
  updated_by      uuid references profiles(id),
  updated_at      timestamptz not null default now(),
  unique(product_id)
);

-- Merchandising data

create table merchandising_data (
  id                  uuid primary key default uuid_generate_v4(),
  product_id          uuid not null references products(id) on delete cascade,
  dimensions          jsonb,
  compartments        text,
  materials           text[],
  volume              text,
  weight              text,
  color_code          text,
  height              text,
  number_of_zips      text,
  pocket_compartments text,
  main_compartments   text,
  unique_purpose      text,
  laptop_compartment  text,
  rain_cover          text,
  back_padded         text,
  season_year         text,
  bottle_slot         text,
  character_name      text,
  theme               text,
  main_material       text,
  material_spec       text,
  colour_variants     jsonb default '[]'::jsonb,
  production_fields   jsonb,
  is_completed        boolean not null default false,
  is_locked           boolean not null default false,
  updated_by          uuid references profiles(id),
  updated_at          timestamptz not null default now(),
  unique(product_id)
);

-- BOM data

create table bom_data (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references products(id) on delete cascade,
  items           jsonb,
  fg_inv_code     text,
  is_completed    boolean not null default false,
  is_locked       boolean not null default false,
  updated_by      uuid references profiles(id),
  updated_at      timestamptz not null default now(),
  unique(product_id)
);

-- Marketing data

create table marketing_data (
  id                uuid primary key default uuid_generate_v4(),
  product_id        uuid not null references products(id) on delete cascade,
  product_features  text[],
  photoshoots       text,
  hero_product      boolean not null default false,
  catalogs          text[],
  launch_creatives  text,
  is_completed      boolean not null default false,
  is_locked         boolean not null default false,
  updated_by        uuid references profiles(id),
  updated_at        timestamptz not null default now(),
  unique(product_id)
);

-- Sales data

create table sales_data (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references products(id) on delete cascade,
  mrp             numeric(12, 2),
  dealer_pricing  numeric(12, 2),
  launch_status   text,
  launch_date     date,
  is_completed    boolean not null default false,
  is_locked       boolean not null default false,
  updated_by      uuid references profiles(id),
  updated_at      timestamptz not null default now(),
  unique(product_id)
);

-- Product files

create table product_files (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid not null references products(id) on delete cascade,
  name          text not null,
  file_url      text not null,
  file_type     text,
  file_size     bigint,
  department    user_role,
  uploaded_by   uuid references profiles(id),
  colour_tag    text,
  created_at    timestamptz not null default now()
);

-- Activity logs

create table activity_logs (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid references products(id) on delete cascade,
  user_id       uuid references profiles(id),
  action        text not null,
  department    text,
  field_changed text,
  old_value     text,
  new_value     text,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

-- Stage unlock requests

create table stage_unlock_requests (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid not null references products(id) on delete cascade,
  stage         workflow_stage not null,
  requested_by  uuid references profiles(id),
  reason        text,
  status        text not null default 'pending',
  resolved_by   uuid references profiles(id),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

-- Item master

create table item_master (
  id               uuid primary key default uuid_generate_v4(),
  inv_code         text not null,
  item_name        text not null,
  item_name_norm   text not null,
  uom              text,
  constraint item_master_norm_unique unique (item_name_norm)
);
create index item_master_norm_idx on item_master (item_name_norm);
