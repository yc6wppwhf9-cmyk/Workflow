-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor
-- Applies the new hierarchy: Sales → Design → Merch → BOM → Marketing
-- ============================================================

-- 1. Add cost_given column to bom_data
alter table bom_data add column if not exists cost_given boolean not null default false;

-- 2. Replace advance_product_stage() with new hierarchy
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
    -- New hierarchy: sales → design → merchandising → bom → marketing (terminal)
    if v_current_stage = 'draft' and v_role <> 'sales' then
      raise exception 'Only sales team or admin can advance from sales stage';
    elsif v_current_stage = 'design_completed' and v_role <> 'design' then
      raise exception 'Only design team or admin can advance from design_completed';
    elsif v_current_stage = 'merchandising_completed' and v_role <> 'merchandising' then
      raise exception 'Only merchandising team or admin can advance from merchandising_completed';
    elsif v_current_stage = 'bom_finalized' and v_role <> 'bom' then
      raise exception 'Only BOM team or admin can advance from bom_finalized';
    elsif v_current_stage in ('marketing_ready', 'sales_priced', 'product_live') then
      raise exception 'Only admin can advance from this stage';
    end if;

    -- Server-side completion checks (who does the work while in each stage)
    case v_current_stage
      when 'draft' then
        -- Sales fills their data before advancing to design
        select coalesce(is_completed, false) into v_is_completed
          from sales_data where product_id = p_product_id;
        if not v_is_completed then
          raise exception 'Sales must be marked complete before advancing';
        end if;
      when 'design_completed' then
        select coalesce(is_completed, false) into v_is_completed
          from design_data where product_id = p_product_id;
        if not v_is_completed then
          raise exception 'Design must be marked complete before advancing';
        end if;
      when 'merchandising_completed' then
        select coalesce(is_completed, false) into v_is_completed
          from merchandising_data where product_id = p_product_id;
        if not v_is_completed then
          raise exception 'Merchandising must be marked complete before advancing';
        end if;
      when 'bom_finalized' then
        select coalesce(is_completed, false) into v_is_completed
          from bom_data where product_id = p_product_id;
        if not v_is_completed then
          raise exception 'BOM must be marked complete before advancing';
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

-- 3. Allow sales role to insert products (products_insert policy already allows all authenticated;
--    this is a no-op but explicit for clarity)
-- No change needed — products_insert already allows auth.role() = 'authenticated'
