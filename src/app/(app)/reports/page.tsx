import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STAGE_LABELS, STAGE_COLORS, ROLE_LABELS, CATEGORY_LABELS, type WorkflowStage, type UserRole, type ProductCategory } from '@/lib/types'
import { Progress } from '@/components/ui/progress'
import { ExportButton } from '@/components/reports/export-button'

export default async function ReportsPage() {
  const supabase = await createClient()

  const [{ data: products }, { data: profiles }] = await Promise.all([
    supabase.from('products').select('workflow_stage, category, created_at'),
    supabase.from('profiles').select('role, is_active'),
  ])

  // Products by stage
  const byStage: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  let total = 0

  for (const p of products || []) {
    byStage[p.workflow_stage] = (byStage[p.workflow_stage] || 0) + 1
    byCategory[p.category] = (byCategory[p.category] || 0) + 1
    total++
  }

  // Users by role
  const byRole: Record<string, number> = {}
  for (const u of profiles || []) {
    byRole[u.role] = (byRole[u.role] || 0) + 1
  }

  const activeUsers = profiles?.filter((u) => u.is_active).length || 0

  return (
    <div>
      <Header title="Reports" subtitle="Analytics and pipeline overview" actions={<ExportButton />} />
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Products by stage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Products by Workflow Stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(STAGE_LABELS).map(([stage, label]) => {
              const count = byStage[stage] || 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[stage as WorkflowStage]}`}>{label}</span>
                    <span className="text-sm font-semibold text-gray-900">{count} <span className="text-xs text-gray-400 font-normal">({pct}%)</span></span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Products by category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Products by Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(byCategory).length > 0
              ? Object.entries(byCategory).sort(([, a], [, b]) => b - a).map(([cat, count]) => {
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">{CATEGORY_LABELS[cat as ProductCategory] || cat}</span>
                        <span className="text-sm font-semibold text-gray-900">{count} <span className="text-xs text-gray-400 font-normal">({pct}%)</span></span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  )
                })
              : <p className="text-sm text-gray-400">No products yet.</p>
            }
          </CardContent>
        </Card>

        {/* Team by role */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team by Role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(ROLE_LABELS).map(([role, label]) => {
              const count = byRole[role] || 0
              return count > 0 ? (
                <div key={role} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{label}</span>
                  <span className="text-sm font-semibold text-gray-900">{count}</span>
                </div>
              ) : null
            })}
            <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
              <span className="text-sm text-gray-500">Active users</span>
              <span className="text-sm font-semibold text-green-600">{activeUsers}</span>
            </div>
          </CardContent>
        </Card>

        {/* Summary KPIs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {[
              { label: 'Total Products', value: total, color: 'text-blue-600' },
              { label: 'Marketing Done', value: byStage['marketing_ready'] || 0, color: 'text-green-600' },
              { label: 'In Progress', value: total - (byStage['draft'] || 0) - (byStage['marketing_ready'] || 0), color: 'text-purple-600' },
              { label: 'Awaiting Sales', value: byStage['draft'] || 0, color: 'text-gray-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center py-4 rounded-xl bg-gray-50">
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
