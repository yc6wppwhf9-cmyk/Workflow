import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { IllustrationReviewQueue } from '@/components/illustration-review/illustration-review-queue'
import type { Profile } from '@/lib/types'

export default async function IllustrationReviewPage() {
  const supabase  = await createClient()
  const profile   = await getCurrentProfile() as Profile

  if (!['design_head', 'management', 'admin'].includes(profile.role)) {
    redirect('/dashboard')
  }

  // design_head reviews designer (role='design') uploads
  // management reviews design_head uploads
  const uploaderRole = profile.role === 'management' ? 'design_head' : 'design'

  // Fetch all pending design illustrations uploaded by the target role
  const { data: pendingFiles } = await supabase
    .from('product_files')
    .select(`
      id, name, file_url, file_type, review_feedback, created_at,
      uploaded_by,
      uploader:profiles!uploaded_by(full_name, role),
      product:products!product_id(id, name, category, sub_category)
    `)
    .eq('department', 'design')
    .eq('review_status', 'pending')
    .like('file_type', 'image/%')
    .is('colour_tag', null)             // exclude print files
    .order('created_at', { ascending: true })

  // Filter by uploader role (Supabase doesn't support deep filter on joined column)
  const filtered = (pendingFiles ?? []).filter(f => {
    const uploader = Array.isArray(f.uploader) ? f.uploader[0] : f.uploader
    return (uploader as { role?: string } | null)?.role === uploaderRole
  })

  // Group by product
  type FileRow = typeof filtered[0]
  const byProduct = new Map<string, { product: { id: string; name: string; category: string; sub_category: string | null }; files: FileRow[] }>()
  for (const file of filtered) {
    const product = Array.isArray(file.product) ? file.product[0] : file.product as { id: string; name: string; category: string; sub_category: string | null } | null
    if (!product) continue
    if (!byProduct.has(product.id)) byProduct.set(product.id, { product, files: [] })
    byProduct.get(product.id)!.files.push(file)
  }

  const groups = [...byProduct.values()]

  return (
    <div>
      <Header
        title="Illustration Review Queue"
        subtitle={
          groups.length === 0
            ? 'No pending illustrations'
            : `${filtered.length} illustration${filtered.length !== 1 ? 's' : ''} across ${groups.length} product${groups.length !== 1 ? 's' : ''}`
        }
      />
      <div className="p-4 sm:p-6">
        <IllustrationReviewQueue
          groups={groups.map(g => ({
            product: g.product,
            files: g.files.map(f => ({
              id:           f.id,
              name:         f.name,
              file_url:     f.file_url,
              uploaded_by:  f.uploaded_by ?? '',
              uploader_name: ((Array.isArray(f.uploader) ? f.uploader[0] : f.uploader) as { full_name?: string } | null)?.full_name ?? 'Unknown',
              created_at:   f.created_at,
            })),
          }))}
          reviewerRole={profile.role}
          reviewerId={profile.id}
          reviewerName={profile.full_name}
        />
      </div>
    </div>
  )
}
