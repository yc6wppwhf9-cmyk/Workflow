import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ProductsTable } from '@/components/products/products-table'
import { NewProductButton } from '@/components/products/new-product-button'
import type { Profile } from '@/lib/types'

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  const { data: products } = await supabase
    .from('products')
    .select(`
      *,
      creator:profiles!created_by(full_name, email),
      design_data(designer_name, color_skus, channel),
      bom_data(fg_inv_code)
    `)
    .order('created_at', { ascending: false })

  return (
    <div>
      <Header
        title="Products"
        subtitle={`${products?.length || 0} products in the system`}
        actions={<NewProductButton profile={profile as Profile} />}
      />
      <div className="p-6">
        <ProductsTable products={products || []} profile={profile as Profile} />
      </div>
    </div>
  )
}
