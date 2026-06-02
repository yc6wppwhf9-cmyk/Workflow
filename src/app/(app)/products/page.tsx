import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ProductsTable } from '@/components/products/products-table'
import { NewProductButton } from '@/components/products/new-product-button'
import { one } from '@/lib/utils'
import type { Profile } from '@/lib/types'

export default async function ProductsPage() {
  const supabase = await createClient()
  const profile = await getCurrentProfile()

  const { data: rawProducts } = await supabase
    .from('products')
    .select(`
      id, name, sku, category, workflow_stage, created_at,
      design_data(designer_name, color_skus, channel),
      bom_data(fg_inv_code)
    `)
    .order('created_at', { ascending: false })

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
