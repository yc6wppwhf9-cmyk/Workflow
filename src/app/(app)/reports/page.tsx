import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STAGE_LABELS, STAGE_COLORS, ROLE_LABELS, CATEGORY_LABELS, type WorkflowStage, type UserRole, type ProductCategory } from '@/lib/types'
import { Progress } from '@/components/ui/progress'
import { ExportButton } from '@/components/reports/export-button'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const role: UserRole = profile?.role || 'viewer'

  const isManagement = ['admin', 'design_head'].includes(role)
  const isAdmin      = role === 'admin'

  const [{ data: products }, { data: profiles }, { data: designSubmissionsRaw }] = await Promise.all([
    supabase.from('products').select('workflow_stage, category, created_at'),
    isAdmin ? supabase.from('profiles').select('role, is_active') : Promise.resolve({ data: null, error: null }),
    isManagement
      ? supabase.from('design_submissions').select('submitted_by, status, submitter:profiles!submitted_by(id, full_name)')
      : Promise.resolve({ data: null, error: null }),
  ])

  // Design efficiency: group submissions by designer (management only)
  const designerMap: Record<string, { name: string; total: number; approved: number; rejected: number; pending: number }> = {}
  for (const row of designSubmissionsRaw || []) {
    const submitter = (Array.isArray(row.submitter) ? row.submitter[0] : row.submitter) as { id: string; full_name: string } | null
    if (!submitter) continue
    if (!designerMap[submitter.id]) {
      designerMap[submitter.id] = { name: submitter.full_name, total: 0, approved: 0, rejected: 0, pending: 0 }
    }
    designerMap[submitter.id].total++
    if (row.status === 'approved') designerMap[submitter.id].approved++
    else if (row.status === 'rejected') designerMap[submitter.id].rejected++
    else designerMap[submitter.id].pending++
  }
  const designerStats = Object.values(designerMap).sort((a, b) => b.total - a.total)

  // Products by stage
  const byStage: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  let total = 0

  for (const p of products || []) {
    byStage[p.workflow_stage] = (byStage[p.workflow_stage] || 0) + 1
    byCategory[p.category] = (byCategory[p.category] || 0) + 1
    total++
  }

  // Users by role (admin only)
  const byRole: Record<string, number> = {}
  for (const u of profiles || []) {
    byRole[u.role] = (byRole[u.role] || 0) + 1
  }
  const activeUsers = profiles?.filter((u) => u.is_active).length || 0

  return (
    <div>
      <Header title="Reports" subtitle="Analytics and pipeline overview" actions={isManagement ? <ExportButton /> : undefined} />
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Products by stage — visible to all */}
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

        {/* Products by category — visible to all */}
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

        {/* Team by Role — admin only */}
        {isAdmin && (
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
        )}

        {/* Pipeline Summary — visible to all */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {[
              { label: 'Total Products',  value: total,                                                                                      color: 'text-blue-600' },
              { label: 'Marketing Done',  value: byStage['marketing_ready'] || 0,                                                            color: 'text-green-600' },
              { label: 'In Progress',     value: total - (byStage['draft'] || 0) - (byStage['marketing_ready'] || 0),                        color: 'text-purple-600' },
              { label: 'Awaiting Sales',  value: byStage['draft'] || 0,                                                                      color: 'text-gray-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center py-4 rounded-xl bg-gray-50">
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Design Team Efficiency — management only */}
        {isManagement && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Design Team Efficiency</CardTitle>
            </CardHeader>
            <CardContent>
              {designerStats.length === 0 ? (
                <p className="text-sm text-gray-400">No design submissions yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">Designer</th>
                      <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase">Submitted</th>
                      <th className="text-center py-2 text-xs font-semibold text-green-600 uppercase">Approved</th>
                      <th className="text-center py-2 text-xs font-semibold text-red-500 uppercase">Rejected</th>
                      <th className="text-center py-2 text-xs font-semibold text-yellow-600 uppercase">Pending</th>
                      <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase">Approval %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {designerStats.map(d => {
                      const rate = d.total > 0 ? Math.round((d.approved / d.total) * 100) : 0
                      return (
                        <tr key={d.name} className="hover:bg-gray-50">
                          <td className="py-2.5 font-medium text-gray-900">{d.name}</td>
                          <td className="py-2.5 text-center text-gray-700">{d.total}</td>
                          <td className="py-2.5 text-center text-green-600 font-semibold">{d.approved}</td>
                          <td className="py-2.5 text-center text-red-500 font-semibold">{d.rejected}</td>
                          <td className="py-2.5 text-center text-yellow-600">{d.pending}</td>
                          <td className="py-2.5 text-center">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rate >= 70 ? 'bg-green-100 text-green-700' : rate >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                              {rate}%
                            </span>
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

      </div>
    </div>
  )
}
