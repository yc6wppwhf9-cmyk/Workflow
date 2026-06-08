import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, CheckCircle2, Clock, FlaskConical, XCircle } from 'lucide-react'
import { one, formatShortDate, daysSince } from '@/lib/utils'

export default async function SamplingQueuePage() {
  const profile = await getCurrentProfile()
  if (!profile || !['admin', 'sampling'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('products')
    .select(`
      id, name, category, created_at,
      sampling_data(sample_review_status, sampler_name, assigned_to, reviewed_at),
      sales_data(deadline_date),
      design_data(assigned_to, variants)
    `)
    .in('sampling_data.sample_review_status', ['pending_review', 'approved', 'rejected'])
    .not('sampling_data', 'is', null)
    .order('created_at', { ascending: false })

  // Show only products where Send for Sampling was pressed (sample_review_status is set)
  const products = (rows || [])
    .map(p => ({
      ...p,
      sampling: one(p.sampling_data) as {
        sample_review_status: string
        sampler_name: string | null
        assigned_to: string | null
        reviewed_at: string | null
      } | null,
      deadline: (one(p.sales_data) as { deadline_date?: string | null } | null)?.deadline_date ?? null,
      variantCount: (() => {
        const dd = one(p.design_data) as { variants?: unknown[] } | null
        return dd?.variants?.length ?? 1
      })(),
    }))
    .filter(p => p.sampling !== null)

  const pending  = products.filter(p => p.sampling?.sample_review_status === 'pending_review')
  const done     = products.filter(p => ['approved', 'rejected'].includes(p.sampling?.sample_review_status ?? ''))

  return (
    <div>
      <Header
        title="Sampling Queue"
        subtitle="Products sent for physical sampling — create samples, upload photos, and record results."
      />
      <div className="p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-violet-200 bg-violet-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-violet-700 font-medium">Pending Sampling</p>
                  <p className="text-3xl font-bold text-violet-800 mt-1">{pending.length}</p>
                </div>
                <Clock className="h-8 w-8 text-violet-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-700 font-medium">Completed</p>
                  <p className="text-3xl font-bold text-green-800 mt-1">{done.length}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Total</p>
                  <p className="text-3xl font-bold text-gray-800 mt-1">{products.length}</p>
                </div>
                <FlaskConical className="h-8 w-8 text-gray-300" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending */}
        {pending.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">No pending samples</p>
              <p className="text-xs text-gray-400 mt-1">The design team hasn&apos;t sent anything for sampling yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-violet-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-violet-700 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Pending — Create Samples &amp; Upload Photos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Category</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Variants</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Waiting</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pending.map(p => (
                    <tr key={p.id} className="hover:bg-violet-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 capitalize">{p.category?.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p.variantCount} colour{p.variantCount !== 1 ? 's' : ''}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p.deadline ? formatShortDate(p.deadline) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-violet-600 font-medium">{daysSince(p.created_at)}d</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/products/${p.id}?tab=sampling`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          Open Sampling Tab <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Completed */}
        {done.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Completed
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Category</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Status</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Sampler</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {done.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 capitalize">{p.category?.replace('_', ' ')}</td>
                      <td className="px-4 py-3">
                        {p.sampling?.sample_review_status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                            <XCircle className="h-3 w-3" /> Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p.sampling?.sampler_name || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/products/${p.id}?tab=sampling`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
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
