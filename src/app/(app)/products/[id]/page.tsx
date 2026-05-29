import { notFound } from 'next/navigation'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ProductDetail } from '@/components/products/product-detail'
import type {
  Profile, Product, DesignData, SamplingData, MerchandisingData,
  BomData, MarketingData, SalesData, ProductFile, ActivityLog, DesignSubmission,
} from '@/lib/types'

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
  const profile = await getCurrentProfile()

  const { data: product } = await supabase
    .from('products')
    .select('*, creator:profiles!created_by(full_name, email)')
    .eq('id', id)
    .single()

  if (!product) notFound()

  const [
    { data: designData },
    { data: samplingData },
    { data: merchandisingData },
    { data: bomData },
    { data: marketingData },
    { data: salesData },
    { data: rawFiles },
    { data: logs },
    { data: designSubmissions },
    { data: designers },
    { data: merchandisingUsers },
  ] = await Promise.all([
    supabase.from('design_data').select('*').eq('product_id', id).single(),
    supabase.from('sampling_data').select('*').eq('product_id', id).single(),
    supabase.from('merchandising_data').select('*').eq('product_id', id).single(),
    supabase.from('bom_data').select('*').eq('product_id', id).single(),
    supabase.from('marketing_data').select('*').eq('product_id', id).single(),
    supabase.from('sales_data').select('*').eq('product_id', id).single(),
    supabase.from('product_files').select('*, uploader:profiles!uploaded_by(full_name)').eq('product_id', id).order('created_at', { ascending: false }).limit(200),
    supabase.from('activity_logs').select('*, user:profiles(full_name)').eq('product_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('design_submissions').select('*, submitter:profiles!submitted_by(id,full_name)').eq('product_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('profiles').select('id, full_name').eq('role', 'design').eq('is_active', true).order('full_name'),
    supabase.from('profiles').select('id, full_name').eq('role', 'merchandising').eq('is_active', true).order('full_name'),
  ])

  // Cloudinary files have permanent public URLs — no signing needed.
  // Supabase-stored files (legacy) still need a 1-hour signed URL.
  const fileList = rawFiles || []
  const cloudinaryFiles = fileList.filter(f => f.file_url.startsWith('https://res.cloudinary.com'))
  const supabaseFiles   = fileList.filter(f => !f.file_url.startsWith('https://res.cloudinary.com'))

  let signedFiles = supabaseFiles
  if (supabaseFiles.length > 0) {
    const paths = supabaseFiles.map(f => {
      const url = f.file_url
      if (!url.startsWith('http')) return url
      const idx = url.indexOf('/product-files/')
      return idx !== -1 ? decodeURIComponent(url.slice(idx + '/product-files/'.length).split('?')[0]) : url
    })
    const { data: signedData } = await supabase.storage
      .from('product-files')
      .createSignedUrls(paths, 3600)
    if (signedData) {
      signedFiles = supabaseFiles.map((f, i) => ({
        ...f,
        storage_path: paths[i],
        file_url: signedData[i]?.signedUrl || f.file_url,
      }))
    }
  }

  const files = [...cloudinaryFiles, ...signedFiles]

  // DB returns `string` for text columns; app types use narrow unions.
  // Cast explicitly at the server→client boundary — values are constrained by DB CHECK
  // constraints and application logic; the cast is intentional, not a workaround.
  return (
    <div>
      <Header
        title={product.name}
        subtitle={bomData?.fg_inv_code ? `FG INV: ${bomData.fg_inv_code}` : undefined}
      />
      <ProductDetail
        product={product as unknown as Product}
        profile={profile as Profile}
        designData={designData as unknown as DesignData | null}
        samplingData={samplingData as unknown as SamplingData | null}
        merchandisingData={merchandisingData as unknown as MerchandisingData | null}
        bomData={bomData as unknown as BomData | null}
        marketingData={marketingData as unknown as MarketingData | null}
        salesData={salesData as unknown as SalesData | null}
        files={files as unknown as ProductFile[]}
        logs={logs as unknown as ActivityLog[] || []}
        designSubmissions={designSubmissions as unknown as DesignSubmission[] || []}
        designers={designers || []}
        merchandisingUsers={merchandisingUsers || []}
        defaultTab={tab}
      />
    </div>
  )
}
