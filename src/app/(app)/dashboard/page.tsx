import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Package, TrendingUp, Clock, CheckCircle2, ArrowRight, Layers } from 'lucide-react'
import Link from 'next/link'
import { STAGE_LABELS, STAGE_COLORS, type WorkflowStage } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: totalProducts },
    { count: liveProducts },
    { count: inProgressProducts },
    { data: recentProducts },
    { data: stageCounts },
    { data: recentLogs },
    { count: designComplete },
    { count: merchComplete },
    { count: bomComplete },
    { count: marketingComplete },
    { count: salesComplete },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('workflow_stage', 'product_live'),
    supabase.from('products').select('*', { count: 'exact', head: true }).not('workflow_stage', 'in', '(draft,product_live)'),
    supabase.from('products').select(`
      id, name, sku, workflow_stage, created_at,
      bom_data(fg_inv_code),
      design_data(designer_name)
    `).order('created_at', { ascending: false }).limit(6),
    supabase.from('products').select('workflow_stage'),
    supabase.from('activity_logs').select('*, user:profiles(full_name), product:products(name, sku)').order('created_at', { ascending: false }).limit(8),
    supabase.from('design_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('merchandising_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('bom_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('marketing_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('sales_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
  ])

  const stageMap: Record<string, number> = {}
  if (stageCounts) {
    for (const p of stageCounts) {
      stageMap[p.workflow_stage] = (stageMap[p.workflow_stage] || 0) + 1
    }
  }

  const total = totalProducts || 0
  const deptTotal = total * 5
  const deptDone = (designComplete || 0) + (merchComplete || 0) + (bomComplete || 0) + (marketingComplete || 0) + (salesComplete || 0)
  const deptRate = deptTotal > 0 ? Math.round((deptDone / deptTotal) * 100) : 0

  const deptStats = [
    { label: 'Design', done: designComplete || 0 },
    { label: 'Merchandising', done: merchComplete || 0 },
    { label: 'BOM', done: bomComplete || 0 },
    { label: 'Marketing', done: marketingComplete || 0 },
    { label: 'Sales', done: salesComplete || 0 },
  ]

  return (
    <div>
      <Header title="Dashboard" subtitle="Overview of your product lifecycle pipeline" />

      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Products</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{total}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Live Products</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{liveProducts || 0}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-green-50 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">In Progress</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{inProgressProducts || 0}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Active pipeline</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Dept. Completion</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{deptRate}%</p>
                  <p className="text-xs text-gray-400 mt-0.5">{deptDone} / {deptTotal} departments</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
              </div>
              <Progress value={deptRate} className="mt-3" />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Department Health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-gray-400" />
                Department Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {deptStats.map(({ label, done }) => {
                const pct = total > 0 ? Math.round((done / total) * 100) : 0
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-700">{label}</span>
                      <span className="text-xs text-gray-500">
                        <span className="font-semibold text-gray-900">{done}</span> / {total}
                      </span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )
              })}
              {total === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No products yet</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Products */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Products</CardTitle>
              <Link href="/products" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {recentProducts?.map((p) => {
                  const bom = (p.bom_data as { fg_inv_code?: string | null }[] | null)?.[0]
                  const design = (p.design_data as { designer_name?: string | null }[] | null)?.[0]
                  return (
                    <Link
                      key={p.id}
                      href={`/products/${p.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 truncate">
                            {p.name || p.sku}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {design?.designer_name && (
                              <span className="text-xs text-gray-400 truncate">{design.designer_name}</span>
                            )}
                            {bom?.fg_inv_code && (
                              <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">
                                {bom.fg_inv_code}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ml-3 ${STAGE_COLORS[p.workflow_stage as WorkflowStage]}`}>
                        {STAGE_LABELS[p.workflow_stage as WorkflowStage]}
                      </span>
                    </Link>
                  )
                })}
                {(!recentProducts || recentProducts.length === 0) && (
                  <p className="text-sm text-gray-400 text-center py-6">
                    No products yet.{' '}
                    <Link href="/products" className="text-blue-600 hover:underline">Create one</Link>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pipeline by Stage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.entries(STAGE_LABELS).map(([stage, label]) => {
                const count = stageMap[stage] || 0
                return (
                  <div key={stage} className="text-center p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <p className="text-2xl font-bold text-gray-900">{count}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-tight">{label}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Activity feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentLogs?.map((log) => {
                const user = (log.user as { full_name?: string } | null)
                const product = (log.product as { name?: string; sku?: string } | null)
                const productLabel = product?.name || product?.sku || ''
                return (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="h-2 w-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                    <div>
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{user?.full_name || 'System'}</span>
                        {' '}{log.action}
                        {productLabel && (
                          <span className="text-gray-500"> · {productLabel}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.created_at)}</p>
                    </div>
                  </div>
                )
              })}
              {(!recentLogs || recentLogs.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
