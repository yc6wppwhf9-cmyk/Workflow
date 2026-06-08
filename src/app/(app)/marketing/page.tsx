import { redirect } from 'next/navigation'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { one } from '@/lib/utils'
import { MarketingClient, type MarketingProduct } from '@/components/marketing/marketing-client'

export default async function MarketingPage() {
  const profile = await getCurrentProfile()
  if (!profile || !['admin', 'marketing', 'marketing_head'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('products')
    .select(`
      id, name, category, created_at,
      sampling_data(sample_review_status, sampler_name, reviewed_at),
      design_data(variants),
      sales_data(deadline_date),
      product_files(id, file_url, file_type, department, file_name)
    `)
    .in('sampling_data.sample_review_status', ['approved'])
    .not('sampling_data', 'is', null)
    .order('created_at', { ascending: false })

  const products: MarketingProduct[] = []

  for (const p of rows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sampling = one(p.sampling_data) as any
    if (sampling?.sample_review_status !== 'approved') continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allFiles = (p.product_files as any[] | null) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variants = ((one(p.design_data) as any)?.variants ?? []) as any[]

    products.push({
      id: p.id as string,
      name: p.name as string,
      category: p.category as string | null,
      samplerName: sampling.sampler_name as string | null,
      reviewedAt: sampling.reviewed_at as string | null,
      variants,
      deadline: (one(p.sales_data) as { deadline_date?: string | null } | null)?.deadline_date ?? null,
      samplePhotos: allFiles
        .filter((f: { department: string | null; file_type: string | null }) =>
          f.department === 'sampling' && f.file_type?.startsWith('image/'))
        .map((f: { id: string; file_url: string; file_name: string }) => ({
          id: f.id,
          url: f.file_url,
          name: f.file_name,
        })),
    })
  }

  return (
    <div>
      <Header
        title="Marketing Queue"
        subtitle="Products with approved samples — review images and assign official product names."
      />
      <MarketingClient products={products} />
    </div>
  )
}
