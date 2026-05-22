import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ProductsTable } from '@/components/products/products-table'
import { NewProductButton } from '@/components/products/new-product-button'
import type { Profile } from '@/lib/types'

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  const { data: productsRaw } = await supabase
    .from('products')
    .select('id, name, sku, category, workflow_stage, created_at')
    .order('created_at', { ascending: false })

  const productIds = (productsRaw || []).map(p => p.id)

  const [{ data: designRows }, { data: bomRows }] = await Promise.all([
    productIds.length > 0
      ? supabase.from('design_data').select('product_id, designer_name, color_skus, channel').in('product_id', productIds)
      : { data: [] },
    productIds.length > 0
      ? supabase.from('bom_data').select('product_id, fg_inv_code').in('product_id', productIds)
      : { data: [] },
  ])

  const designMap = Object.fromEntries((designRows || []).map(d => [d.product_id, d]))
  const bomMap = Object.fromEntries((bomRows || []).map(b => [b.product_id, b]))

  const products = (productsRaw || []).map(p => ({
    ...p,
    design_data: designMap[p.id] ?? null,
    bom_data: bomMap[p.id] ?? null,
  }))

  return (
    <div>
      <Header
        title="Products"
        subtitle={`${products.length} products in the system`}
        actions={<NewProductButton profile={profile as Profile} />}
      />
      <div className="p-6">
        <ProductsTable products={products} profile={profile as Profile} />
      </div>
    </div>
  )
}
