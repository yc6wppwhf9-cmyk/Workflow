import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Clock, ArrowRight, Send, AlertCircle, Pencil, CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { one, daysSince } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { KpiCard } from './_shared'
import { NewProductButton } from '@/components/products/new-product-button'

export async function DesignHeadDashboard({ profile, filter }: { profile: Profile; filter?: string }) {
  const show = (key: string) => !filter || filter === key
  const supabase = await createClient()

  const [
    { data: pendingFiles },
    { data: productsInDesign },
    { data: designDataForProducts },
    { data: myFiles },
  ] = await Promise.all([
    // Pending reviews = designer submissions only (exclude design head's own uploads)
    supabase.from('product_files')
      .select('product_id, created_at, uploaded_by, uploader:profiles!uploaded_by(full_name, role), product:products(id, name)')
      .eq('review_status', 'pending')
      .eq('department', 'design')
      .neq('uploaded_by', profile.id)
      .order('created_at', { ascending: true }),

    supabase.from('products')
      .select('id, name, sku, created_at, workflow_stage')
      .in('workflow_stage', ['draft', 'design_completed'])
      .order('created_at', { ascending: false }),

    supabase.from('design_data')
      .select('product_id, assigned_to, assignee:profiles!assigned_to(full_name)'),

    // My own illustrations — all files uploaded by the design head (exclude print files; include null colour_tag)
    supabase.from('product_files')
      .select('product_id, review_status, created_at, product:products(id, name, sku, workflow_stage, sampling:sampling_data(sample_review_status))')
      .eq('uploaded_by', profile.id)
      .eq('department', 'design')
      .or('colour_tag.is.null,colour_tag.neq.print')
      .order('created_at', { ascending: false }),
  ])

  // Deduplicate pending: one entry per product (oldest pending file)
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

  // My work — deduplicate by product, summarise file statuses
  const myWorkMap: Record<string, {
    productId: string; name: string; sku: string | null; stage: string
    total: number; approved: number; pending: number; rejected: number
    samplingStatus: string | null; createdAt: string
  }> = {}
  for (const f of myFiles || []) {
    const product  = one(f.product) as { id: string; name: string; sku: string | null; workflow_stage: string; sampling?: unknown } | null
    if (!product) continue
    const samplingRow = one((product as any).sampling) as { sample_review_status: string } | null
    const pid = f.product_id
    if (!myWorkMap[pid]) {
      myWorkMap[pid] = {
        productId: pid, name: product.name, sku: product.sku, stage: product.workflow_stage,
        total: 0, approved: 0, pending: 0, rejected: 0,
        samplingStatus: samplingRow?.sample_review_status ?? null,
        createdAt: f.created_at,
      }
    }
    myWorkMap[pid].total++
    if (f.review_status === 'approved') myWorkMap[pid].approved++
    else if (f.review_status === 'rejected') myWorkMap[pid].rejected++
    else myWorkMap[pid].pending++
  }
  const myWork = Object.values(myWorkMap).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const headWorking = new Set(myWork.map(w => w.productId))
  const unassigned = (productsInDesign || []).filter(p => !assignMap[p.id] && !headWorking.has(p.id))
  const assigned   = (productsInDesign || []).filter(p =>  assignMap[p.id] || headWorking.has(p.id))
  const pending    = pendingSubmissions

  return (
    <div>
      <Header title="Design Head Dashboard" subtitle={`Welcome, ${profile.full_name.split(' ')[0]}`} />
      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Pending Reviews" value={pending.length}    sub="awaiting your approval"    icon={Send}        color="bg-amber-50 [&>svg]:text-amber-500"   href="?f=pending"    active={filter === 'pending'} />
          <KpiCard label="Unassigned"      value={unassigned.length} sub="need a designer"           icon={AlertCircle} color="bg-red-50 [&>svg]:text-red-500"      href="?f=unassigned" active={filter === 'unassigned'} />
          <KpiCard label="In Progress"     value={assigned.length}   sub="assigned & active"         icon={Clock}       color="bg-blue-50 [&>svg]:text-blue-600"    href="?f=active"     active={filter === 'active'} />
          <KpiCard label="My Work"         value={myWork.length}     sub="your own designs"          icon={Pencil}      color="bg-violet-50 [&>svg]:text-violet-600" href="?f=mywork"     active={filter === 'mywork'} />
          <KpiCard label="Total Active"    value={(productsInDesign || []).length} sub="draft + design stage" icon={Package} color="bg-purple-50 [&>svg]:text-purple-600" href="?f=all" active={filter === 'all'} />
        </div>

        {/* ── Pending Reviews ── */}
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

        {/* ── Unassigned Products ── */}
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

        {/* ── My Work ── */}
        {show('mywork') && myWork.length > 0 && (
          <Card className="border-violet-200">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-violet-700 flex items-center gap-2">
                <Pencil className="h-4 w-4" /> My Designs
              </CardTitle>
              <NewProductButton profile={profile} />
            </CardHeader>
            <CardContent className="space-y-3">
              {myWork.map(w => {
                const illoBadge = w.approved === w.total && w.total > 0
                  ? <span className="flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" /> {w.approved} approved</span>
                  : w.rejected > 0
                  ? <span className="flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><XCircle className="h-3 w-3" /> {w.rejected} rejected</span>
                  : <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><Clock className="h-3 w-3" /> {w.pending} pending review</span>

                const samplingBadge = w.samplingStatus === 'approved'
                  ? <span className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Sample approved</span>
                  : w.samplingStatus === 'pending_review'
                  ? <span className="text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Sample in review</span>
                  : w.samplingStatus === 'rejected'
                  ? <span className="text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Sample rejected</span>
                  : null

                return (
                  <div key={w.productId} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{w.name}</p>
                        {w.sku && <span className="font-mono text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{w.sku}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {illoBadge}
                        {samplingBadge}
                      </div>
                    </div>
                    <Link href={`/products/${w.productId}?tab=design`} className="text-xs text-violet-600 hover:underline flex items-center gap-1 shrink-0 ml-4">
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {show('mywork') && myWork.length === 0 && (
          <Card className="border-violet-100 bg-violet-50/40">
            <CardContent className="py-10 text-center space-y-3">
              <Pencil className="h-8 w-8 text-violet-300 mx-auto" />
              <p className="text-sm font-medium text-violet-700">No personal designs yet</p>
              <p className="text-xs text-violet-500">Create a product and upload your own illustrations to see them here.</p>
              <div className="flex justify-center pt-1">
                <NewProductButton profile={profile} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
