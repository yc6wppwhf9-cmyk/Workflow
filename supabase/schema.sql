-- ============================================================
-- PLM System — Full Database Schema
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

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

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================

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

-- ============================================================
-- PRODUCTS
-- ============================================================

create table products (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  sku             text unique not null,
  category        text not null default 'junior-backpacks',  -- free text, validated in app
  brand           text,
  description     text,
  workflow_stage  workflow_stage not null default 'draft',
  is_locked       boolean not null default false,
  created_by      uuid references profiles(id),
  updated_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- DESIGN DATA
-- ============================================================

create table design_data (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references products(id) on delete cascade,
  channel         text,
  designer_name   text,
  sample_color    text,
  color_skus      text[],
  unique_feature  text,
  -- Tech pack fields (exact mapping from design Excel)
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

-- ============================================================
-- MERCHANDISING DATA
-- ============================================================

create table merchandising_data (
  id                  uuid primary key default uuid_generate_v4(),
  product_id          uuid not null references products(id) on delete cascade,
  -- Physical specs
  dimensions          jsonb,    -- { length, width, height, unit }
  compartments        text,
  materials           text[],
  volume              text,
  weight              text,
  -- Detail fields (from ATTRIBUTES FORMAT sheet)
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
  -- Colour variants (from Excel upload, includes per-variant BOM)
  colour_variants     jsonb default '[]'::jsonb,
  -- Revised Excel upload stored separately; first upload = attribute, re-upload = production
  production_fields   jsonb,
  is_completed        boolean not null default false,
  is_locked           boolean not null default false,
  updated_by          uuid references profiles(id),
  updated_at          timestamptz not null default now(),
  unique(product_id)
);

-- ============================================================
-- BOM DATA
-- ============================================================

create table bom_data (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references products(id) on delete cascade,
  items           jsonb,   -- [{ inv_code, inv_name, quantity, unit }]
  fg_inv_code     text,    -- finished goods INV code from ERP, entered by BOM team
  is_completed    boolean not null default false,
  is_locked       boolean not null default false,
  updated_by      uuid references profiles(id),
  updated_at      timestamptz not null default now(),
  unique(product_id)
);

-- ============================================================
-- MARKETING DATA
-- ============================================================

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

-- ============================================================
-- SALES DATA
-- ============================================================

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

-- ============================================================
-- PRODUCT FILES
-- ============================================================

create table product_files (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid not null references products(id) on delete cascade,
  name          text not null,
  file_url      text not null,
  file_type     text,
  file_size     bigint,
  department    user_role,
  uploaded_by   uuid references profiles(id),
  colour_tag    text,    -- links image to a specific colour variant
  created_at    timestamptz not null default now()
);

-- ============================================================
-- ACTIVITY LOGS
-- ============================================================

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

-- ============================================================
-- STAGE UNLOCK REQUESTS
-- ============================================================

create table stage_unlock_requests (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid not null references products(id) on delete cascade,
  stage         workflow_stage not null,
  requested_by  uuid references profiles(id),
  reason        text,
  status        text not null default 'pending',  -- pending | approved | rejected
  resolved_by   uuid references profiles(id),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at
  before update on products
  for each row execute function update_updated_at();

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- Auto-create department rows when a product is created
create or replace function create_product_department_rows()
returns trigger as $$
begin
  insert into design_data (product_id) values (new.id);
  insert into merchandising_data (product_id) values (new.id);
  insert into bom_data (product_id) values (new.id);
  insert into marketing_data (product_id) values (new.id);
  insert into sales_data (product_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger products_create_departments
  after insert on products
  for each row execute function create_product_department_rows();

-- Auto-create profile on new auth user
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- ITEM MASTER
-- ============================================================

create table item_master (
  id               uuid primary key default uuid_generate_v4(),
  inv_code         text not null,
  item_name        text not null,
  item_name_norm   text not null,   -- trim + lowercase + collapsed spaces, for fast lookup
  uom              text,
  constraint item_master_norm_unique unique (item_name_norm)
);
create index item_master_norm_idx on item_master (item_name_norm);

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================

create table system_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into system_settings (key, value) values
  ('company_name', 'HSCVPL'),
  ('company_tagline', 'Product Lifecycle Management')
on conflict (key) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table system_settings enable row level security;
alter table item_master enable row level security;
alter table profiles enable row level security;
alter table products enable row level security;
alter table design_data enable row level security;
alter table merchandising_data enable row level security;
alter table bom_data enable row level security;
alter table marketing_data enable row level security;
alter table sales_data enable row level security;
alter table product_files enable row level security;
alter table activity_logs enable row level security;
alter table stage_unlock_requests enable row level security;

-- System settings
create policy "settings_select" on system_settings for select using (auth.role() = 'authenticated');
create policy "settings_update" on system_settings for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Item Master
create policy "item_master_select" on item_master for select using (auth.role() = 'authenticated');
create policy "item_master_insert" on item_master for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "item_master_delete" on item_master for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Profiles
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- Products
create policy "products_select" on products for select using (auth.role() = 'authenticated');
create policy "products_insert" on products for insert with check (auth.role() = 'authenticated');
create policy "products_update" on products for update using (
  exists (
    select 1 from profiles
    where id = auth.uid()
      and is_active = true
      and role in ('admin', 'design', 'merchandising', 'bom', 'marketing', 'sales')
  )
);

-- Design data
create policy "design_select" on design_data for select using (auth.role() = 'authenticated');
create policy "design_update" on design_data for update using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'design'))
);

-- Merchandising data
create policy "merch_select" on merchandising_data for select using (auth.role() = 'authenticated');
create policy "merch_update" on merchandising_data for update using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'merchandising'))
);

-- BOM data
create policy "bom_select" on bom_data for select using (auth.role() = 'authenticated');
create policy "bom_update" on bom_data for update using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'bom'))
);

-- Marketing data
create policy "marketing_select" on marketing_data for select using (auth.role() = 'authenticated');
create policy "marketing_update" on marketing_data for update using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'marketing'))
);

-- Sales data
create policy "sales_select" on sales_data for select using (auth.role() = 'authenticated');
create policy "sales_update" on sales_data for update using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'sales'))
);

-- Files
create policy "files_select" on product_files for select using (auth.role() = 'authenticated');
create policy "files_insert" on product_files for insert with check (auth.role() = 'authenticated');
create policy "files_delete" on product_files for delete using (
  uploaded_by = auth.uid() or
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Activity logs
create policy "logs_select" on activity_logs for select using (auth.role() = 'authenticated');
create policy "logs_insert" on activity_logs for insert with check (auth.role() = 'authenticated');

-- Stage unlock requests
create policy "unlock_select" on stage_unlock_requests for select using (auth.role() = 'authenticated');
create policy "unlock_insert" on stage_unlock_requests for insert with check (auth.role() = 'authenticated');
create policy "unlock_update" on stage_unlock_requests for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

insert into storage.buckets (id, name, public)
values ('product-files', 'product-files', false)
on conflict (id) do nothing;

create policy "product_files_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-files');

create policy "product_files_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-files');

create policy "product_files_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-files');

-- ============================================================
-- TRANSACTIONAL RPC FUNCTIONS
-- ============================================================

create or replace function advance_product_stage(
  p_product_id uuid,
  p_next_stage workflow_stage,
  p_user_id uuid,
  p_action text,
  p_department text
) returns void as $$
declare
  v_current_stage workflow_stage;
  v_role user_role;
  v_is_completed boolean;
begin
  if auth.uid() <> p_user_id then
    raise exception 'Unauthorized user ID';
  end if;

  select role into v_role from profiles where id = p_user_id;
  select workflow_stage into v_current_stage from products where id = p_product_id;

  if v_role <> 'admin' then
    if v_current_stage = 'draft' and v_role <> 'design' then
      raise exception 'Only design team or admin can advance from draft';
    elsif v_current_stage = 'design_completed' and v_role <> 'merchandising' then
      raise exception 'Only merchandising team or admin can advance from design_completed';
    elsif v_current_stage = 'merchandising_completed' and v_role <> 'bom' then
      raise exception 'Only BOM team or admin can advance from merchandising_completed';
    elsif v_current_stage = 'bom_finalized' and v_role <> 'marketing' then
      raise exception 'Only marketing team or admin can advance from bom_finalized';
    elsif v_current_stage = 'marketing_ready' and v_role <> 'sales' then
      raise exception 'Only sales team or admin can advance from marketing_ready';
    elsif v_current_stage in ('sales_priced', 'product_live') then
      raise exception 'Only admin can advance from this stage';
    end if;

    -- Server-side is_completed check (non-admins only)
    case v_current_stage
      when 'draft' then
        select coalesce(is_completed, false) into v_is_completed
          from design_data where product_id = p_product_id;
        if not v_is_completed then
          raise exception 'Design must be marked complete before advancing';
        end if;
      when 'design_completed' then
        select coalesce(is_completed, false) into v_is_completed
          from merchandising_data where product_id = p_product_id;
        if not v_is_completed then
          raise exception 'Merchandising must be marked complete before advancing';
        end if;
      when 'merchandising_completed' then
        select coalesce(is_completed, false) into v_is_completed
          from bom_data where product_id = p_product_id;
        if not v_is_completed then
          raise exception 'BOM must be marked complete before advancing';
        end if;
      when 'bom_finalized' then
        select coalesce(is_completed, false) into v_is_completed
          from marketing_data where product_id = p_product_id;
        if not v_is_completed then
          raise exception 'Marketing must be marked complete before advancing';
        end if;
      when 'marketing_ready' then
        select coalesce(is_completed, false) into v_is_completed
          from sales_data where product_id = p_product_id;
        if not v_is_completed then
          raise exception 'Sales must be marked complete before advancing';
        end if;
      else null;
    end case;
  end if;

  update products
  set workflow_stage = p_next_stage, updated_by = p_user_id, updated_at = now()
  where id = p_product_id;

  insert into activity_logs (product_id, user_id, action, department)
  values (p_product_id, p_user_id, p_action, p_department);
end;
$$ language plpgsql security definer;

create or replace function unlock_product_stage(
  p_product_id uuid,
  p_prev_stage workflow_stage,
  p_user_id uuid,
  p_action text,
  p_department text
) returns void as $$
declare
  v_role user_role;
begin
  if auth.uid() <> p_user_id then
    raise exception 'Unauthorized user ID';
  end if;

  select role into v_role from profiles where id = p_user_id;

  if v_role <> 'admin' then
    raise exception 'Only admin can unlock stages directly';
  end if;

  update products
  set workflow_stage = p_prev_stage, updated_by = p_user_id, updated_at = now()
  where id = p_product_id;

  insert into activity_logs (product_id, user_id, action, department)
  values (p_product_id, p_user_id, p_action, p_department);
end;
$$ language plpgsql security definer;
