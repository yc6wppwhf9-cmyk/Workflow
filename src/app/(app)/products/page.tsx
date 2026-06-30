import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ProductsTable } from '@/components/products/products-table'
import { NewProductButton } from '@/components/products/new-product-button'
import { one } from '@/lib/utils'
import type { Profile } from '@/lib/types'

export default async function ProductsPage() {
  const supabase = await createClient()
  const profile = await getCurrentProfile()

  // Designers only see their own assigned products
  let assignedProductIds: string[] | null = null
  if (profile?.role === 'design') {
    const { data: assignments } = await supabase
      .from('design_data')
      .select('product_id')
      .eq('assigned_to', profile.id)
    assignedProductIds = (assignments || []).map(a => a.product_id)
  }

  const query = supabase
    .from('products')
    .select(`
      id, name, sku, category, sub_category, workflow_stage, created_at,
      design_data(designer_name, color_skus, channel, designer:profiles!assigned_to(full_name)),
      bom_data(fg_inv_code)
    `)
    .order('created_at', { ascending: false })

  if (assignedProductIds !== null) {
    if (assignedProductIds.length === 0) query.eq('id', 'no-match')
    else query.in('id', assignedProductIds)
  }

  const { data: rawProducts } = await query

  // Normalize Supabase nested join arrays to scalars expected by ProductsTable
  const products = (rawProducts || []).map(p => {
    const dd = one(p.design_data) as { designer_name: string | null; color_skus: string[] | null; channel: string | null; designer?: { full_name: string | null } | { full_name: string | null }[] | null } | null
    const designer = Array.isArray(dd?.designer) ? dd?.designer[0] : dd?.designer
    return {
      ...p,
      design_data: dd,
      bom_data: one(p.bom_data),
      assigned_designer: designer?.full_name ?? null,
    }
  })

  return (
    <div>
      <Header
        title="Products"
        subtitle={`${products.length} products in the system`}
        actions={<NewProductButton profile={profile as Profile} />}
      />
      <div className="p-4 sm:p-6">
        <ProductsTable products={products} profile={profile as Profile} />
      </div>
    </div>
  )
}
