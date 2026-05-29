import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Clock, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { one, formatDateTime, formatShortDate } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { KpiCard, StageBadge } from './_shared'

export async function SalesDashboard({ profile, filter }: { profile: Profile; filter?: string }) {
  const show = (key: string) => !filter || filter === key
  const supabase = await createClient()

  const [{ data: myProducts }, { data: recentLogs }] = await Promise.all([
    supabase.from('products')
      .select('id, name, sku, workflow_stage, created_at, sales_data(is_completed, assign_to, deadline_date, product_specification)')
      .eq('created_by', profile.id)
      .order('created_at', { ascending: false }),
    supabase.from('activity_logs')
      .select('*, user:profiles(full_name), product:products(name)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const allMine   = myProducts || []
  const needsInput = allMine.filter(p => p.workflow_stage === 'draft')
  const inPipeline = allMine.filter(p => p.workflow_stage !== 'draft' && p.workflow_stage !== 'product_live')
  const live       = allMine.filter(p => p.workflow_stage === 'product_live')

  return (
    <div>
      <Header title={`Welcome, ${profile.full_name.split(' ')[0]}`} subtitle="Your products and requirements" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="My Products"  value={allMine.length}    icon={Package}      color="bg-blue-50 [&>svg]:text-blue-600"    href="?f=all"          active={filter === 'all'} />
          <KpiCard label="Needs Input"  value={needsInput.length} sub="draft stage"   icon={AlertCircle}  color="bg-amber-50 [&>svg]:text-amber-500"   href="?f=needs-input"  active={filter === 'needs-input'} />
          <KpiCard label="In Pipeline"  value={inPipeline.length} sub="past sales stage" icon={Clock}    color="bg-purple-50 [&>svg]:text-purple-600" href="?f=in-pipeline"  active={filter === 'in-pipeline'} />
          <KpiCard label="Live"         value={live.length}       icon={CheckCircle2} color="bg-green-50 [&>svg]:text-green-600"   href="?f=live"         active={filter === 'live'} />
        </div>

        {show('needs-input') && needsInput.length > 0 && (
          <Card className="border-amber-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-amber-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> Needs Your Input
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Assigned To</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {needsInput.map(p => {
                    const sd = one(p.sales_data) as { assign_to?: string | null; deadline_date?: string | null } | null
                    return (
                      <tr key={p.id} className="hover:bg-amber-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{sd?.assign_to || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{sd?.deadline_date ? formatShortDate(sd.deadline_date) : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/products/${p.id}?tab=sales`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
                            Open <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {show('all') && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">All My Products</CardTitle>
              <Link href="/products" className="text-sm text-blue-600 hover:underline flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allMine.slice(0, 8).map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3"><Link href={`/products/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600">{p.name}</Link></td>
                      <td className="px-4 py-3"><StageBadge stage={p.workflow_stage} /></td>
                    </tr>
                  ))}
                  {allMine.length === 0 && (
                    <tr><td colSpan={2} className="text-center py-8 text-sm text-gray-400">
                      No products yet. <Link href="/products" className="text-blue-600 hover:underline">Create one</Link>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {show('in-pipeline') && inPipeline.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">In Pipeline</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Stage</th>
                  <th className="px-4 py-2"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {inPipeline.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3"><StageBadge stage={p.workflow_stage} /></td>
                      <td className="px-4 py-3 text-right"><Link href={`/products/${p.id}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">Open <ArrowRight className="h-3 w-3" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {show('live') && live.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base text-green-700">Live Products</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                  <th className="px-4 py-2"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {live.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-right"><Link href={`/products/${p.id}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">Open <ArrowRight className="h-3 w-3" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {show('all') && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">My Recent Activity</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(recentLogs || []).map(log => {
                const product = one(log.product) as { name?: string } | null
                return (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="h-2 w-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm text-gray-900">{log.action}{product?.name && <span className="text-gray-500"> · {product.name}</span>}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.created_at)}</p>
                    </div>
                  </div>
                )
              })}
              {(recentLogs || []).length === 0 && <p className="text-sm text-gray-400 text-center py-2">No activity yet.</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
