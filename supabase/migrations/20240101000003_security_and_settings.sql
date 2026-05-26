-- ============================================================
-- Migration: Security fixes, private storage, settings table
-- ============================================================

-- 1. Make product-files bucket private
update storage.buckets set public = false where id = 'product-files';

-- Authenticated read (needed for signed-URL generation via RLS)
drop policy if exists "product_files_read" on storage.objects;
create policy "product_files_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-files');

-- 2. Tighten products_update — only active role holders, not viewers
drop policy if exists "products_update" on products;
create policy "products_update" on products for update using (
  exists (
    select 1 from profiles
    where id = auth.uid()
      and is_active = true
      and role in ('admin', 'design', 'merchandising', 'bom', 'marketing', 'sales')
  )
);

-- 3. Add profiles_update_admin so admins can update any profile (role changes)
drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles for update using (
  auth.uid() = id
  or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- 4. Replace advance_product_stage() with is_completed server-side check
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

  -- Role-based stage ownership check
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

-- 5. System settings table (company name, tagline, etc.)
create table if not exists system_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into system_settings (key, value) values
  ('company_name', 'HSCVPL'),
  ('company_tagline', 'Product Lifecycle Management')
on conflict (key) do nothing;

alter table system_settings enable row level security;
create policy "settings_select" on system_settings for select using (auth.role() = 'authenticated');
create policy "settings_update" on system_settings for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
