-- ============================================================
-- Migration: Triggers, functions, and transactional RPCs
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

-- Advance workflow stage (enforces role-based permission in SQL)

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
    elsif v_current_stage = 'sales_priced' or v_current_stage = 'product_live' then
      raise exception 'Only admin can advance from this stage';
    end if;
  end if;

  update products
  set workflow_stage = p_next_stage, updated_by = p_user_id, updated_at = now()
  where id = p_product_id;

  insert into activity_logs (product_id, user_id, action, department)
  values (p_product_id, p_user_id, p_action, p_department);
end;
$$ language plpgsql security definer;

-- Unlock workflow stage (admin only)

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
