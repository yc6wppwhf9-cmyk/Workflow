import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    { count: inProgressProducts },
    { data: recentProducts },
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
    supabase.from('products').select('id, name, sku, workflow_stage, created_at, bom_data(fg_inv_code)').order('created_at', { ascending: false }).limit(6),
    supabase.from('activity_logs').select('*, user:profiles(full_name), product:products(name, sku)').order('created_at', { ascending: false }).limit(8),
    supabase.from('design_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('merchandising_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('bom_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('marketing_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('sales_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
  ])

  const total = totalProducts || 0
  const deptTotal = total * 5
  const deptDone = (designComplete || 0) + (merchComplete || 0) + (bomComplete || 0) + (marketingComplete || 0) + (salesComplete || 0)
  const deptRate = deptTotal > 0 ? Math.round((deptDone / deptTotal) * 100) : 0

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

        {/* Recent Products */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Products</CardTitle>
            <Link href="/products" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Product Name</th>
                  <th className="text-right pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">FG INV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentProducts?.map((p) => {
                  const bomRaw = p.bom_data as { fg_inv_code?: string | null }[] | { fg_inv_code?: string | null } | null
                  const bom = Array.isArray(bomRaw) ? bomRaw[0] : bomRaw
                  return (
                    <tr key={p.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="py-3">
                        <Link href={`/products/${p.id}`} className="font-medium text-gray-900 group-hover:text-blue-600">
                          {p.name || p.sku}
                        </Link>
                      </td>
                      <td className="py-3 text-right">
                        {bom?.fg_inv_code
                          ? <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{bom.fg_inv_code}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
                {(!recentProducts || recentProducts.length === 0) && (
                  <tr><td colSpan={2} className="text-center py-6 text-sm text-gray-400">
                    No products yet.{' '}
                    <Link href="/products" className="text-blue-600 hover:underline">Create one</Link>
                  </td></tr>
                )}
              </tbody>
            </table>
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
