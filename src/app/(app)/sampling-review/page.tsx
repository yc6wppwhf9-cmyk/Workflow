import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, CheckCircle2, Clock, FlaskConical } from 'lucide-react'
import { one, formatShortDate, daysSince } from '@/lib/utils'

export default async function SamplingReviewPage() {
  const profile = await getCurrentProfile()
  if (!profile || !['admin', 'merchandising_head'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  const { data: samplingProducts } = await supabase
    .from('products')
    .select(`
      id, name, workflow_stage, created_at,
      sampling_data(sample_review_status, sampler_name, reviewed_at, remarks),
      sales_data(deadline_date)
    `)
    .eq('workflow_stage', 'sampling_completed')
    .order('created_at', { ascending: false })

  const products = (samplingProducts || []).map(p => ({
    ...p,
    sampling: one(p.sampling_data) as { sample_review_status: string; sampler_name: string | null; reviewed_at: string | null; remarks: string | null } | null,
    deadline: (one(p.sales_data) as { deadline_date?: string | null } | null)?.deadline_date ?? null,
  }))

  const pending   = products.filter(p => p.sampling?.sample_review_status === 'pending_review' || !p.sampling?.reviewed_at)
  const approved  = products.filter(p => p.sampling?.sample_review_status === 'approved')
  const rejected  = products.filter(p => p.sampling?.sample_review_status === 'rejected')

  return (
    <div>
      <Header
        title="Sampling Review"
        subtitle="Products awaiting your sample approval before moving to Merchandising"
      />
      <div className="p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-700 font-medium">Awaiting Review</p>
                  <p className="text-3xl font-bold text-amber-800 mt-1">{pending.length}</p>
                </div>
                <Clock className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-700 font-medium">Approved</p>
                  <p className="text-3xl font-bold text-green-800 mt-1">{approved.length}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Total at Stage</p>
                  <p className="text-3xl font-bold text-gray-800 mt-1">{products.length}</p>
                </div>
                <FlaskConical className="h-8 w-8 text-gray-300" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending review */}
        {pending.length > 0 && (
          <Card className="border-amber-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Samples Waiting for Your Approval
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Sampler</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Waiting</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pending.map(p => (
                    <tr key={p.id} className="hover:bg-amber-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.sampling?.sampler_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p.deadline ? formatShortDate(p.deadline) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-amber-600 font-medium">{daysSince(p.created_at)}d</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/products/${p.id}?tab=sampling`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
                          Review <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {pending.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">All samples reviewed</p>
              <p className="text-xs text-gray-400 mt-1">No samples are waiting for your approval right now.</p>
            </CardContent>
          </Card>
        )}

        {/* Approved */}
        {approved.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Recently Approved
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Sampler</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {approved.slice(0, 5).map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.sampling?.sampler_name || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/products/${p.id}?tab=sampling`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
                          View <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
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
