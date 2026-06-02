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
      id, name, sku, category, workflow_stage, created_at,
      design_data(designer_name, color_skus, channel),
      bom_data(fg_inv_code)
    `)
    .order('created_at', { ascending: false })

  if (assignedProductIds !== null) {
    if (assignedProductIds.length === 0) query.eq('id', 'no-match')
    else query.in('id', assignedProductIds)
  }

  const { data: rawProducts } = await query

  // Normalize Supabase nested join arrays to scalars expected by ProductsTable
  const products = (rawProducts || []).map(p => ({
    ...p,
    design_data: one(p.design_data),
    bom_data: one(p.bom_data),
  }))

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
