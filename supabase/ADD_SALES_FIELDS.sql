-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor
-- Adds new sales requirement fields to sales_data table
-- ============================================================

alter table sales_data
  add column if not exists assign_to         text,
  add column if not exists channel           text,
  add column if not exists price_range       text,
  add column if not exists deadline_date     date,
  add column if not exists product_specification text;
