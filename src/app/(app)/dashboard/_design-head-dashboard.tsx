import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Clock, ArrowRight, Send, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { one, daysSince } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { KpiCard } from './_shared'

export async function DesignHeadDashboard({ profile, filter }: { profile: Profile; filter?: string }) {
  const show = (key: string) => !filter || filter === key
  const supabase = await createClient()

  const [{ data: pendingFiles }, { data: productsInDesign }, { data: designDataForProducts }] = await Promise.all([
    // Pending reviews = products that have at least one file with review_status = 'pending'
    supabase.from('product_files')
      .select('product_id, created_at, uploader:profiles!uploaded_by(full_name), product:products(id, name)')
      .eq('review_status', 'pending')
      .eq('department', 'design')
      .order('created_at', { ascending: true }),
    supabase.from('products')
      .select('id, name, created_at, workflow_stage')
      .in('workflow_stage', ['draft', 'design_completed'])
      .order('created_at', { ascending: false }),
    supabase.from('design_data')
      .select('product_id, assigned_to, assignee:profiles!assigned_to(full_name)'),
  ])

  // Deduplicate: one entry per product (oldest pending file per product)
  const seenProducts = new Set<string>()
  const pendingSubmissions = (pendingFiles || []).filter(f => {
    if (seenProducts.has(f.product_id)) return false
    seenProducts.add(f.product_id)
    return true
  })

  const assignMap: Record<string, string | null> = {}
  for (const d of designDataForProducts || []) {
    const assignee = one(d.assignee) as { full_name: string } | null
    assignMap[d.product_id] = assignee?.full_name || null
  }

  const unassigned = (productsInDesign || []).filter(p => !assignMap[p.id])
  const assigned   = (productsInDesign || []).filter(p =>  assignMap[p.id])
  const pending    = pendingSubmissions

  return (
    <div>
      <Header title="Design Head Dashboard" subtitle={`Welcome, ${profile.full_name.split(' ')[0]}`} />
      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Pending Reviews" value={pending.length}    sub="awaiting your approval" icon={Send}        color="bg-amber-50 [&>svg]:text-amber-500"   href="?f=pending"    active={filter === 'pending'} />
          <KpiCard label="Unassigned"      value={unassigned.length} sub="need a designer"        icon={AlertCircle} color="bg-red-50 [&>svg]:text-red-500"      href="?f=unassigned" active={filter === 'unassigned'} />
          <KpiCard label="In Progress"     value={assigned.length}   sub="assigned & active"      icon={Clock}       color="bg-blue-50 [&>svg]:text-blue-600"    href="?f=active"     active={filter === 'active'} />
          <KpiCard label="Total Active"    value={(productsInDesign || []).length} sub="draft + design stage" icon={Package} color="bg-purple-50 [&>svg]:text-purple-600" href="?f=all" active={filter === 'all'} />
        </div>

        {show('pending') && pending.length > 0 && (
          <Card className="border-amber-200">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Pending Reviews — Oldest First
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.map(f => {
                const uploader = one(f.uploader) as { full_name: string } | null
                const product  = one(f.product)  as { id: string; name: string } | null
                const waitDays = daysSince(f.created_at)
                return (
                  <div key={f.product_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{product?.name}</p>
                      <p className="text-xs text-gray-500">by {uploader?.full_name} · {waitDays === 0 ? 'today' : `${waitDays}d ago`}</p>
                    </div>
                    <Link href={`/products/${product?.id}?tab=design`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 shrink-0">
                      Review <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {show('unassigned') && unassigned.length > 0 && (
          <Card className="border-red-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-red-600 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> Unassigned Products
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {unassigned.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${p.workflow_stage === 'draft' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                      {p.workflow_stage === 'draft' ? 'From Sales' : 'Design Stage'}
                    </span>
                  </div>
                  <Link href={`/products/${p.id}?tab=design`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    Assign <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
