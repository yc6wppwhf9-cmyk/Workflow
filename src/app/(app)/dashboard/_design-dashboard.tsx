import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, CheckCircle2, ArrowRight, XCircle, UserCheck, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { one, isOverdue, formatShortDate } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { KpiCard } from './_shared'

export async function DesignDashboard({ profile, filter }: { profile: Profile; filter?: string }) {
  const show = (key: string) => !filter || filter === key
  const supabase = await createClient()

  const [{ data: myAssignments }, { data: mySubmissions }, { data: myFiles }] = await Promise.all([
    supabase.from('design_data')
      .select('product_id, is_completed, product:products(id, name, workflow_stage, created_at, sales_data(deadline_date), sampling_data(sample_review_status, updated_at))')
      .eq('assigned_to', profile.id),
    supabase.from('design_submissions')
      .select('product_id, status, created_at, feedback, reviewed_at')
      .eq('submitted_by', profile.id)
      .order('created_at', { ascending: false }),
    supabase.from('product_files')
      .select('product_id', { count: 'exact', head: false })
      .eq('uploaded_by', profile.id)
      .eq('department', 'design')
      .like('file_type', 'image/%'),
  ])

  type MySubRow = NonNullable<typeof mySubmissions>[number]
  const latestSubByProduct: Record<string, MySubRow> = {}
  for (const sub of mySubmissions || []) {
    if (!latestSubByProduct[sub.product_id]) latestSubByProduct[sub.product_id] = sub
  }
  const imagesByProduct: Record<string, number> = {}
  for (const f of myFiles || []) {
    imagesByProduct[f.product_id] = (imagesByProduct[f.product_id] || 0) + 1
  }

  const assignments = (myAssignments || []).map(a => {
    const prod = one(a.product) as { id: string; name: string; workflow_stage: string; created_at: string; sales_data?: { deadline_date?: string | null }[] | null } | null
    const deadline = prod?.sales_data ? (one(prod.sales_data) as { deadline_date?: string | null } | null)?.deadline_date ?? null : null
    return {
      ...a,
      product: prod,
      deadline,
      latestSub: latestSubByProduct[a.product_id] ?? null,
      imagesUploaded: imagesByProduct[a.product_id] ?? 0,
    }
  })

  const allSubs      = mySubmissions || []
  const pendingReview = assignments.filter(a => a.latestSub?.status === 'pending').length
  const needsWork     = assignments.filter(a => !a.latestSub || a.latestSub.status === 'rejected').length

  return (
    <div>
      <Header title={`My Work, ${profile.full_name.split(' ')[0]}`} subtitle="Design assignments and submission status" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard label="Assigned to Me" value={assignments.length} icon={UserCheck}  color="bg-violet-50 [&>svg]:text-violet-600" href="?f=all"       active={filter === 'all'} />
          <KpiCard label="Needs Work"     value={needsWork}          sub="not yet submitted" icon={AlertCircle} color="bg-amber-50 [&>svg]:text-amber-500" href="?f=needs-work" active={filter === 'needs-work'} />
          <KpiCard label="In Review"      value={pendingReview}      sub="awaiting head" icon={Clock}      color="bg-blue-50 [&>svg]:text-blue-600"   href="?f=in-review"  active={filter === 'in-review'} />
        </div>

        {show('all') && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">My Assigned Products</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {assignments.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 py-6 text-center">No products assigned to you yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Images</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Subs</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {assignments.map(a => {
                      const sub      = a.latestSub
                      const subCount = allSubs.filter(s => s.product_id === a.product_id).length
                      const rejCount = allSubs.filter(s => s.product_id === a.product_id && s.status === 'rejected').length
                      return (
                        <tr key={a.product_id} className={`hover:bg-gray-50 ${isOverdue(a.deadline) ? 'bg-red-50' : ''}`}>
                          <td className="px-6 py-3 font-medium text-gray-900">{a.product?.name || a.product_id}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {a.deadline
                              ? <span className={isOverdue(a.deadline) ? 'text-red-600 font-semibold' : ''}>{formatShortDate(a.deadline)}{isOverdue(a.deadline) ? ' ⚠' : ''}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">{a.imagesUploaded}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-gray-700">{subCount}</span>
                            {rejCount > 0 && <span className="text-red-400 text-xs ml-1">({rejCount} rej.)</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {!sub ? (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Not started</span>
                            ) : sub.status === 'pending' ? (
                              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1 justify-center w-fit mx-auto"><Clock className="h-3 w-3" />In review</span>
                            ) : sub.status === 'approved' ? (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1 justify-center w-fit mx-auto"><CheckCircle2 className="h-3 w-3" />Approved</span>
                            ) : (
                              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1 justify-center w-fit mx-auto"><XCircle className="h-3 w-3" />Rejected</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/products/${a.product?.id || a.product_id}?tab=design`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
                              Open <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {show('needs-work') && (
          <Card className="border-amber-200">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-amber-700 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Needs Work</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50"><th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th><th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Status</th><th className="px-4 py-2"></th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {assignments.filter(a => !a.latestSub || a.latestSub.status === 'rejected').map(a => (
                    <tr key={a.product_id} className="hover:bg-amber-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{a.product?.name || a.product_id}</td>
                      <td className="px-4 py-3 text-center">{!a.latestSub ? <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Not started</span> : <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Rejected</span>}</td>
                      <td className="px-4 py-3 text-right"><Link href={`/products/${a.product?.id || a.product_id}?tab=design`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">Open <ArrowRight className="h-3 w-3" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {show('in-review') && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-blue-700 flex items-center gap-2"><Clock className="h-4 w-4" /> In Review</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50"><th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th><th className="px-4 py-2"></th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {assignments.filter(a => a.latestSub?.status === 'pending').map(a => (
                    <tr key={a.product_id} className="hover:bg-blue-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{a.product?.name || a.product_id}</td>
                      <td className="px-4 py-3 text-right"><Link href={`/products/${a.product?.id || a.product_id}?tab=design`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">Open <ArrowRight className="h-3 w-3" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
