import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ProductDetail } from '@/components/products/product-detail'
import type { Profile } from '@/lib/types'

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
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
    { data: rawFiles },
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

  // Convert stored paths to 1-hour signed URLs (bucket is private)
  const fileList = rawFiles || []
  let files = fileList
  if (fileList.length > 0) {
    const paths = fileList.map(f => {
      const url = f.file_url
      if (!url.startsWith('http')) return url
      // Legacy public URL — extract storage path
      const parts = url.split('/product-files/')
      return parts.length > 1 ? decodeURIComponent(parts[1].split('?')[0]) : url
    })
    const { data: signedData } = await supabase.storage
      .from('product-files')
      .createSignedUrls(paths, 3600)
    if (signedData) {
      files = fileList.map((f, i) => ({
        ...f,
        file_url: signedData[i]?.signedUrl || f.file_url,
      }))
    }
  }

  return (
    <div>
      <Header
        title={product.name}
        subtitle={bomData?.fg_inv_code ? `FG INV: ${bomData.fg_inv_code}` : undefined}
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
        defaultTab={tab}
      />
    </div>
  )
}
