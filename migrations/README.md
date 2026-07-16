# Database migrations

Standalone SQL applied to the Supabase project. Run each once, in roughly the
order below (all are idempotent — `IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS`).

> ⚠️ `ALTER TYPE … ADD VALUE` (enum changes) can't run inside a transaction that
> also uses the new value. If your SQL runner wraps statements in a transaction
> and errors with *"ALTER TYPE … ADD cannot run inside a transaction block,"*
> run that `ALTER TYPE` line on its own first.

| File | Adds |
|---|---|
| `migration_add_sub_category.sql` | `products.sub_category` |
| `migration_family_name.sql` | `products.family_name` (construction/family batching) |
| `migration_variants_column.sql` | `design_data.variants` (multi-variant tech pack) |
| `migration_techpack_pdf.sql` | `design_data.techpack_pdf_url` |
| `migration_marketing_head_role.sql` | `marketing_head` role |
| `migration_purchase_head.sql` | `purchase_head` role |
| `migration_social_links.sql` | `marketing_data.social_links` |
| `migration_new_development.sql` | `new_developments` + `new_development_files` |
| `migration_sampling_rounds.sql` | `sampling_rounds` (one row per sampling iteration) |
| `migration_new_development_merch_access.sql` | lets `merchandising` create/upload in New Development |
| `migration_sampling_team_roles.sql` | moves Shriya to the sampling team |
| `migration_costing_naming.sql` | `costing_naming` stage + `products.product_range` / `md_costing_approved` |
| `migration_design_merch_remark.sql` | `design_data.merch_remarks` (per-design merch-head remarks) |
| `migration_addition_work.sql` | `addition_work` table (merch head → BOM Excel + INV reply) |
