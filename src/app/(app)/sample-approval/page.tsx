import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, CheckCircle2, Clock, FlaskConical } from 'lucide-react'
import { one, formatShortDate, daysSince } from '@/lib/utils'
import { canApproveSamples } from '@/lib/types'

// Dedicated queue for the designated sample approver (Amrita) + admins.
// Lists samples that have been submitted and are awaiting approval.
export default async function SampleApprovalPage() {
  const profile = await getCurrentProfile()
  if (!profile || !canApproveSamples(profile)) {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('products')
    .select(`
      id, name, category, workflow_stage, created_at,
      sampling_data(sample_review_status, sampler_name, reviewed_at),
      sales_data(deadline_date)
    `)
    .eq('workflow_stage', 'design_completed')
    .order('created_at', { ascending: false })

  const products = (rows || []).map(p => ({
    ...p,
    sampling: one(p.sampling_data) as { sample_review_status: string; sampler_name: string | null; reviewed_at: string | null } | null,
    deadline: (one(p.sales_data) as { deadline_date?: string | null } | null)?.deadline_date ?? null,
  }))

  const pending = products.filter(p => p.sampling?.sample_review_status === 'pending_review')

  // Sample photos for the pending products
  const ids = pending.map(p => p.id)
  const { data: files } = ids.length
    ? await supabase
        .from('product_files')
        .select('id, product_id, file_url, name, file_type')
        .in('product_id', ids)
        .eq('department', 'sampling')
    : { data: [] as { id: string; product_id: string; file_url: string; name: string; file_type: string | null }[] }

  const photosByProduct: Record<string, { id: string; file_url: string; name: string }[]> = {}
  for (const f of files || []) {
    if (!f.file_type?.startsWith('image/')) continue
    ;(photosByProduct[f.product_id] ||= []).push(f)
  }

  return (
    <div>
      <Header
        title="Sample Approval"
        subtitle="Physical samples submitted and waiting for your approval"
      />
      <div className="p-6 space-y-6">

        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-700 font-medium">Awaiting Approval</p>
                  <p className="text-3xl font-bold text-amber-800 mt-1">{pending.length}</p>
                </div>
                <Clock className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">In Design Stage</p>
                  <p className="text-3xl font-bold text-gray-800 mt-1">{products.length}</p>
                </div>
                <FlaskConical className="h-8 w-8 text-gray-300" />
              </div>
            </CardContent>
          </Card>
        </div>

        {pending.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">No samples waiting</p>
              <p className="text-xs text-gray-400 mt-1">Submitted samples will appear here for your approval.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pending.map(p => {
              const photos = photosByProduct[p.id] || []
              return (
                <Card key={p.id} className="border-amber-200 overflow-hidden">
                  <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base text-gray-900">{p.name}</CardTitle>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-1.5">
                        {p.category && <span className="capitalize">{String(p.category).replace(/_/g, ' ')}</span>}
                        {p.sampling?.sampler_name && <span>Sampler: {p.sampling.sampler_name}</span>}
                        {p.deadline && <span>Deadline: {formatShortDate(p.deadline)}</span>}
                        <span className="text-amber-600 font-medium">Waiting {daysSince(p.created_at)}d</span>
                      </div>
                    </div>
                    <Link
                      href={`/products/${p.id}?tab=sampling`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shrink-0"
                    >
                      Review &amp; Approve <ArrowRight className="h-3 w-3" />
                    </Link>
                  </CardHeader>
                  {photos.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {photos.slice(0, 8).map(f => (
                          <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.file_url} alt={f.name} className="h-28 w-28 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition" />
                          </a>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
