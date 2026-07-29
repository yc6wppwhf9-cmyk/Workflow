'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Lock, Save, Download, Tag, CheckCircle2, UserCheck, Send, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { isPlaceholderVariant, type Product, type Profile, type BomData, type MerchandisingData, type ColourVariant } from '@/lib/types'

interface BomTabProps {
  product: Product
  profile: Profile
  data: BomData | null
  merchandisingData: MerchandisingData | null
  bomUsers?: Pick<Profile, 'id' | 'full_name'>[]
}

export function BomTab({ product, profile, data, merchandisingData, bomUsers = [] }: BomTabProps) {
  const router = useRouter()
  const isBomHead = ['admin', 'bom_head'].includes(profile.role)
  const isBomMember = profile.role === 'bom'
  const isRoleAllowed = isBomHead || isBomMember
  const isAssignedToMe = data?.assigned_to === profile.id
  const isSubmitted = !!data?.submitted_for_approval
  // Head can always edit; a member only their own assigned BOM, until submitted.
  const canEdit = !data?.is_locked && !data?.is_completed && (
    isBomHead || (isBomMember && isAssignedToMe && !isSubmitted)
  )

  const [assignTo, setAssignTo] = useState(data?.assigned_to || '')
  const [bomBusy, setBomBusy] = useState(false)
  const [rejectFeedback, setRejectFeedback] = useState('')
  const [showReject, setShowReject] = useState(false)

  async function bomAction(action: 'assign' | 'submit' | 'approve' | 'reject', extra?: Record<string, unknown>) {
    setBomBusy(true)
    try {
      const res = await fetch('/api/bom-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, action, ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed')
      const msg = action === 'assign' ? 'BOM assigned'
        : action === 'submit' ? 'Submitted for approval'
        : action === 'approve' ? 'BOM approved — moved to Marketing'
        : 'Sent back for changes'
      toast.success(msg)
      setShowReject(false)
      setRejectFeedback('')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBomBusy(false)
    }
  }

  // Skip template placeholders / attribute labels imported as bogus variants
  const colourVariants = (merchandisingData?.colour_variants || []).filter(
    v => !isPlaceholderVariant(v)
  )

  // Key by styleName, not colourTag — two designs can share a colour (e.g. two
  // LIGHT PINK), and keying by colour made the second design's BOM unreachable.
  const variantKey = (v: ColourVariant, i: number) => v.styleName || v.colourTag || `variant-${i}`
  const [activeColour, setActiveColour] = useState<string>(
    colourVariants[0] ? (colourVariants[0].styleName || colourVariants[0].colourTag || 'variant-0') : ''
  )
  const [fgInvCode, setFgInvCode] = useState(data?.fg_inv_code || '')
  const [costGiven, setCostGiven] = useState(data?.cost_given || false)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [exporting, setExporting] = useState(false)

  // ── Costing & Naming gate (after BOM) ──────────────────────────────
  // BOM approval now advances straight to Marketing, so the costing/naming card
  // must be reachable while the product is still at BOM — not only at the
  // (now bypassed) costing_naming stage.
  const isCostingNamingStage = product.workflow_stage === 'costing_naming'
    || (isBomHead && product.workflow_stage === 'bom_finalized')
  const [rangeInput, setRangeInput] = useState(product.product_range || '')
  const [productName, setProductName] = useState(product.name)
  const [mdApproved, setMdApproved] = useState(product.md_costing_approved || false)
  const [namingSaving, setNamingSaving] = useState(false)
  const [gateAdvancing, setGateAdvancing] = useState(false)

  async function saveRange() {
    if (!rangeInput.trim()) return
    setNamingSaving(true)
    try {
      const res = await fetch('/api/set-product-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, range: rangeInput.trim() }),
      })
      const json = await res.json() as { ok?: boolean; name?: string; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed')
      if (json.name) setProductName(json.name)

    } finally {
      setNamingSaving(false)
    }
  }

  async function toggleMdApproved() {
    const next = !mdApproved
    setMdApproved(next)
    await fetch('/api/set-md-costing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, approved: next }),
    })
  }

  async function completeCostingNaming() {
    setGateAdvancing(true)
    const supabase = createClient()
    await supabase.rpc('advance_product_stage', {
      p_product_id: product.id,
      p_next_stage: 'marketing_ready',
      p_user_id: profile.id,
      p_action: 'completed Costing & Naming — stage advanced to Marketing',
      p_department: 'bom',
    })
    fetch('/api/notify-stage-advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, product_name: productName, next_stage: 'marketing_ready' }),
    }).catch(() => {})
    setGateAdvancing(false)
    router.refresh()
  }

  async function exportToExcel() {
    if (colourVariants.length === 0) return
    setExporting(true)
    try {
      const { utils, writeFile } = await import('xlsx')
      const wb = utils.book_new()

      // ── Summary sheet ────────────────────────────────────────────────
      const summaryRows = [
        ['Product Name', product.name],
        ['FG INV Code',  data?.fg_inv_code || '—'],
        ['Brand',        product.brand     || '—'],
        ['Exported',     new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
        [],
        ['Colour', 'Items in BOM'],
        ...colourVariants.map((v: ColourVariant) => [v.styleName || v.colourTag, (v.bomItems || []).length]),
      ]
      const summaryWs = utils.aoa_to_sheet(summaryRows)
      summaryWs['!cols'] = [{ wch: 20 }, { wch: 30 }]
      utils.book_append_sheet(wb, summaryWs, 'Summary')

      // ── One sheet per colour ─────────────────────────────────────────
      for (const variant of colourVariants) {
        const items = variant.bomItems || []
        const headerRow = ['#', 'Item Name', 'INV Code', 'Consumption', 'Unit']
        const dataRows  = items.map((item, i) => [
          i + 1,
          item.inv_name    || '',
          item.inv_code    || '',
          item.consumption || '',
          item.unit        || '',
        ])
        const ws = utils.aoa_to_sheet([headerRow, ...dataRows])
        ws['!cols'] = [{ wch: 4 }, { wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 10 }]
        // Safe sheet name: max 31 chars, no special chars
        // Sheet names must be unique — two designs can share a colour, so prefix
        // the index and prefer the (unique) style name.
        const idx = colourVariants.indexOf(variant) + 1
        const base = (variant.styleName || variant.colourTag || '').replace(/[\\/*?[\]:]/g, '').trim()
        const sheetName = `${idx}. ${base}`.slice(0, 31)
        utils.book_append_sheet(wb, ws, base ? sheetName : `Colour ${idx}`)
      }

      const safeName = product.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
      const dateStr  = new Date().toISOString().slice(0, 10)
      writeFile(wb, `${safeName}_BOM_${dateStr}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  const fgSaved = !!data?.fg_inv_code
  const activeVariant = colourVariants.find((v, i) => variantKey(v, i) === activeColour) || colourVariants[0] || null

  async function saveFgInvCode() {
    if (!fgInvCode.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('bom_data').update({ fg_inv_code: fgInvCode.trim() || null, updated_by: profile.id }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `saved FG INV code: ${fgInvCode.trim()}`, department: 'bom',
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); router.refresh() }, 2000)
  }

  async function toggleCostGiven() {
    if (!fgSaved) return
    const next = !costGiven
    setCostGiven(next)
    const supabase = createClient()
    await supabase.from('bom_data').update({ cost_given: next, updated_by: profile.id }).eq('product_id', product.id)
  }

  async function markComplete() {
    const becomingComplete = !data?.is_completed
    setSaving(true)
    const supabase = createClient()
    await supabase.from('bom_data').update({ is_completed: becomingComplete, updated_by: profile.id }).eq('product_id', product.id)

    if (becomingComplete && product.workflow_stage === 'bom_finalized') {
      await supabase.rpc('advance_product_stage', {
        p_product_id: product.id,
        p_next_stage: 'costing_naming',
        p_user_id: profile.id,
        p_action: 'marked BOM complete — stage advanced to Costing & Naming',
        p_department: 'bom',
      })
      fetch('/api/notify-stage-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: 'costing_naming' }),
      }).catch(() => {})
    }

    setSaving(false)
    router.refresh()
  }

  return (
    <div className="max-w-5xl space-y-4">

      {/* ── BOM team workflow: head assigns → member submits → head approves ── */}
      {isRoleAllowed && !data?.is_completed && (
        <Card className={isSubmitted ? 'border-amber-300' : 'border-orange-200'}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-orange-600" /> BOM Task
              {isSubmitted && (
                <span className="ml-auto text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                  Awaiting approval
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">

            {/* Head: assign to a team member */}
            {isBomHead && (
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-sm text-gray-600 shrink-0">Assign to</Label>
                <select
                  value={assignTo}
                  onChange={e => setAssignTo(e.target.value)}
                  className="h-8 text-sm border border-gray-200 rounded-md px-2 bg-white min-w-[12rem]"
                >
                  <option value="">— Unassigned —</option>
                  {bomUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
                <Button size="sm" variant="outline" disabled={bomBusy}
                  onClick={() => bomAction('assign', { assignee_id: assignTo || null })}>
                  {bomBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                  Assign
                </Button>
              </div>
            )}
            {!isBomHead && data?.assigned_to && (
              <p className="text-xs text-gray-500">
                Assigned to: <span className="font-medium text-gray-800">
                  {bomUsers.find(u => u.id === data.assigned_to)?.full_name ?? (isAssignedToMe ? 'you' : '—')}
                </span>
              </p>
            )}

            {/* Member: submit for approval */}
            {isBomMember && isAssignedToMe && !isSubmitted && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Fill in the BOM below, then send it to the BOM head for approval.</p>
                <Button size="sm" disabled={bomBusy} onClick={() => bomAction('submit')}>
                  {bomBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit for Approval
                </Button>
              </div>
            )}
            {isBomMember && isSubmitted && (
              <p className="text-sm text-amber-700">Submitted — waiting for the BOM head to approve.</p>
            )}

            {/* Head: approve or send back */}
            {isBomHead && isSubmitted && (
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700"
                    disabled={bomBusy || !mdApproved}
                    title={!mdApproved ? 'Tick “Costing approved by MD” below first' : 'Approve and send to Marketing'}
                    onClick={() => bomAction('approve')}>
                    {bomBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve &amp; Send to Marketing
                  </Button>
                  {!mdApproved && (
                    <p className="text-xs text-amber-700 w-full">
                      Waiting on MD costing approval — tick it in <strong>Costing &amp; Naming</strong> below. Naming can be done later.
                    </p>
                  )}
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200"
                    disabled={bomBusy} onClick={() => setShowReject(v => !v)}>
                    <XCircle className="h-4 w-4" /> Send Back
                  </Button>
                </div>
                {showReject && (
                  <div className="space-y-2">
                    <Input placeholder="What needs changing?" value={rejectFeedback}
                      onChange={e => setRejectFeedback(e.target.value)} className="h-8 text-sm" />
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200"
                      disabled={bomBusy || !rejectFeedback.trim()}
                      onClick={() => bomAction('reject', { feedback: rejectFeedback.trim() })}>
                      Confirm Send Back
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}


      {/* ── Costing & Naming gate (Naam Karan + MD costing approval) ──── */}
      {isCostingNamingStage && (
        <Card className="border-pink-300 border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-pink-700">
              <Tag className="h-4 w-4" /> Costing &amp; Naming
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Give the product its rangewise name, then confirm MD costing approval before it moves to Marketing.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Naam Karan — rangewise naming */}
            <div className="space-y-2">
              <Label className="text-xs">Range (Naam Karan)</Label>
              <div className="flex items-end gap-3 flex-wrap">
                <Input
                  placeholder="e.g. Summer Trekker"
                  value={rangeInput}
                  onChange={e => setRangeInput(e.target.value)}
                  disabled={!isRoleAllowed || namingSaving}
                  className="h-8 text-sm w-64"
                />
                {isRoleAllowed && (
                  <Button size="sm" onClick={saveRange} disabled={namingSaving || !rangeInput.trim()}>
                    {namingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                    Generate Name
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Product name:{' '}
                <span className="font-semibold text-gray-800">{productName}</span>
                <span className="text-gray-400"> — auto-numbered within the range</span>
              </p>
            </div>

            {/* MD costing approval checkbox */}
            <div className="pt-3 border-t border-gray-100">
              <label className={`flex items-center gap-2 select-none ${isRoleAllowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                <input
                  type="checkbox"
                  checked={mdApproved}
                  onChange={toggleMdApproved}
                  disabled={!isRoleAllowed}
                  className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                />
                <span className="text-sm text-gray-700">Costing approved by MD</span>
              </label>
            </div>

            {/* Advance to Marketing */}
            {/* Only shown at the standalone costing_naming stage. When BOM approval
                drives the hand-off, the Approve button above is the single exit —
                gated on MD costing only, since naming can be done later. */}
            {isRoleAllowed && product.workflow_stage === 'costing_naming' && (
              <div className="pt-2 border-t border-gray-100">
                <Button
                  onClick={completeCostingNaming}
                  disabled={gateAdvancing || !mdApproved}
                  className="bg-pink-600 hover:bg-pink-700"
                  title={!mdApproved ? 'Confirm MD costing approval first' : undefined}
                >
                  {gateAdvancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Complete &amp; Send to Marketing
                </Button>
                {!mdApproved && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    Tick MD costing approval to continue. The rangewise name is optional and can be added later.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Bill of Materials</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">Per-colour BOM pre-filled from merchandising Excel.</p>
          </div>
          <div className="flex items-center gap-2">
            {colourVariants.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportToExcel} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export Excel
              </Button>
            )}
            {data?.is_locked && (
              <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
                <Lock className="h-3 w-3" /> Stage Locked
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* FG INV Code */}
          <div className="flex items-end gap-3 pb-4 border-b border-gray-100">
            <div className="space-y-1.5 w-72">
              <Label className="text-xs">Finished Goods INV Code</Label>
              <Input
                placeholder="ERP INV code for this product"
                value={fgInvCode}
                onChange={e => setFgInvCode(e.target.value.toUpperCase())}
                disabled={!canEdit}
                className="font-mono h-8 text-sm"
              />
            </div>
            {canEdit && (
              <Button size="sm" onClick={saveFgInvCode} disabled={saving || !fgInvCode.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            )}
            {fgSaved && (
              <span className="text-xs text-gray-400 pb-1.5">Saved: <span className="font-mono font-medium text-gray-700">{data?.fg_inv_code}</span></span>
            )}
          </div>

          {/* Colour BOM tabs */}
          {colourVariants.length > 0 ? (
            <>
              <div className="flex items-center gap-1 border-b border-gray-100 pb-3 flex-wrap">
                {colourVariants.map((v, i) => {
                  const key = variantKey(v, i)
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveColour(key)}
                      title={v.styleName || v.colourTag}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeColour === key ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                    >
                      {v.styleName || v.colourTag}
                    </button>
                  )
                })}
              </div>

              {activeVariant && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-700">{activeVariant.styleName || activeVariant.colourTag} — components from merchandising Excel</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-8">#</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Item Name</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">INV Code</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-28">Consumption</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-24">Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(activeVariant.bomItems || []).map((item, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 text-sm text-gray-800">{item.inv_name}</td>
                          <td className="px-3 py-2 text-sm font-mono text-gray-600">{item.inv_code || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{item.consumption || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{item.unit || <span className="text-gray-300">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!activeVariant.bomItems || activeVariant.bomItems.length === 0) && (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-sm">No BOM items for this colour.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
              <p className="text-sm">No colour variants yet.</p>
              <p className="text-xs mt-1">Upload the merchandising Excel to populate BOM data.</p>
            </div>
          )}

          {/* Cost Given + Actions */}
          {saved && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">FG INV code saved.</p>
          )}
          {isRoleAllowed && !data?.is_locked && (
            <div className="flex items-center gap-4 pt-2 border-t border-gray-100 flex-wrap">
              <label
                className={`flex items-center gap-2 select-none ${fgSaved && canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                title={!fgSaved ? 'Save the FG INV code first' : ''}
              >
                <input
                  type="checkbox"
                  checked={costGiven}
                  onChange={toggleCostGiven}
                  disabled={!fgSaved || !canEdit}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Cost Given</span>
              </label>
              {!data?.is_completed && (
                <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={saving} className="text-green-600 border-green-200">
                  Mark BOM Complete
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        title="Mark BOM Complete?"
        description="This will advance the product to the Marketing stage and notify the marketing team. BOM fields will be locked."
        confirmLabel="Yes, Mark Complete"
        loading={saving}
        onConfirm={() => { setConfirmOpen(false); markComplete() }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
