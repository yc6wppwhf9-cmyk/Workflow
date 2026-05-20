import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Package, TrendingUp, Clock, CheckCircle2, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { STAGE_LABELS, STAGE_COLORS, type WorkflowStage } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: totalProducts },
    { count: liveProducts },
    { count: draftProducts },
    { data: recentProducts },
    { data: stageCounts },
    { data: recentLogs },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('workflow_stage', 'product_live'),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('workflow_stage', 'draft'),
    supabase.from('products').select('id, name, sku, workflow_stage, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('products').select('workflow_stage'),
    supabase.from('activity_logs').select('*, user:profiles(full_name)').order('created_at', { ascending: false }).limit(8),
  ])

  // Count products per stage
  const stageMap: Record<string, number> = {}
  if (stageCounts) {
    for (const p of stageCounts) {
      stageMap[p.workflow_stage] = (stageMap[p.workflow_stage] || 0) + 1
    }
  }

  const total = totalProducts || 1
  const completionRate = Math.round(((liveProducts || 0) / total) * 100)

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
                  <p className="text-3xl font-bold text-gray-900 mt-1">{totalProducts || 0}</p>
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
                  <p className="text-sm text-gray-500">In Draft</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{draftProducts || 0}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-gray-50 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-gray-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Completion Rate</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{completionRate}%</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
              </div>
              <Progress value={completionRate} className="mt-3" />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pipeline by stage */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Pipeline by Stage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(STAGE_LABELS).map(([stage, label]) => {
                const count = stageMap[stage] || 0
                const pct = Math.round((count / total) * 100)
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">{label}</span>
                      <span className="text-xs font-semibold text-gray-900">{count}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Recent products */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Products</CardTitle>
              <Link href="/products" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentProducts?.map((p) => (
                  <Link
                    key={p.id}
                    href={`/products/${p.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.sku}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STAGE_COLORS[p.workflow_stage as WorkflowStage]}`}>
                      {STAGE_LABELS[p.workflow_stage as WorkflowStage]}
                    </span>
                  </Link>
                ))}
                {(!recentProducts || recentProducts.length === 0) && (
                  <p className="text-sm text-gray-400 text-center py-6">No products yet. <Link href="/products/new" className="text-blue-600 hover:underline">Create one</Link></p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentLogs?.map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{(log.user as { full_name?: string } | null)?.full_name || 'System'}</span>
                      {' '}{log.action}
                      {log.field_changed && (
                        <span className="text-gray-500"> · {log.field_changed}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.created_at)}</p>
                  </div>
                </div>
              ))}
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
