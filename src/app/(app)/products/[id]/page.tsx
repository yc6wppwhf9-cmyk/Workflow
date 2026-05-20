import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ProductDetail } from '@/components/products/product-detail'
import type { Profile } from '@/lib/types'

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  const { data: product } = await supabase
    .from('products')
    .select('*, creator:profiles!created_by(full_name, email)')
    .eq('id', id)
    .single()

  if (!product) notFound()

  const [
    { data: designData },
    { data: merchandisingData },
    { data: bomData },
    { data: marketingData },
    { data: salesData },
    { data: files },
    { data: logs },
  ] = await Promise.all([
    supabase.from('design_data').select('*').eq('product_id', id).single(),
    supabase.from('merchandising_data').select('*').eq('product_id', id).single(),
    supabase.from('bom_data').select('*').eq('product_id', id).single(),
    supabase.from('marketing_data').select('*').eq('product_id', id).single(),
    supabase.from('sales_data').select('*').eq('product_id', id).single(),
    supabase.from('product_files').select('*, uploader:profiles!uploaded_by(full_name)').eq('product_id', id).order('created_at', { ascending: false }),
    supabase.from('activity_logs').select('*, user:profiles(full_name)').eq('product_id', id).order('created_at', { ascending: false }).limit(50),
  ])

  return (
    <div>
      <Header
        title={product.name}
        subtitle={`SKU: ${product.sku} · ${product.category}`}
      />
      <ProductDetail
        product={product}
        profile={profile as Profile}
        designData={designData}
        merchandisingData={merchandisingData}
        bomData={bomData}
        marketingData={marketingData}
        salesData={salesData}
        files={files || []}
        logs={logs || []}
      />
    </div>
  )
}
