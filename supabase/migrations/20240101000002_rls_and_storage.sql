-- ============================================================
-- Migration: Row-level security policies and storage bucket
-- ============================================================

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

-- Item master
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
create policy "products_update" on products for update using (auth.role() = 'authenticated');

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

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('product-files', 'product-files', true)
on conflict (id) do nothing;

create policy "product_files_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-files');

create policy "product_files_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-files');

create policy "product_files_read" on storage.objects
  for select using (bucket_id = 'product-files');
