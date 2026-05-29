'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { Product, Profile, BomData, MerchandisingData } from '@/lib/types'

interface BomTabProps {
  product: Product
  profile: Profile
  data: BomData | null
  merchandisingData: MerchandisingData | null
}

export function BomTab({ product, profile, data, merchandisingData }: BomTabProps) {
  const router = useRouter()
  const isRoleAllowed = ['admin', 'bom'].includes(profile.role)
  const canEdit = !data?.is_locked && !data?.is_completed && isRoleAllowed

  const PLACEHOLDER = /^colou?rs?$/i
  const colourVariants = (merchandisingData?.colour_variants || []).filter(
    v => !PLACEHOLDER.test((v.colourTag || '').trim())
  )

  const [activeColour, setActiveColour] = useState<string>(colourVariants[0]?.colourTag || '')
  const [fgInvCode, setFgInvCode] = useState(data?.fg_inv_code || '')
  const [costGiven, setCostGiven] = useState(data?.cost_given || false)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  const fgSaved = !!data?.fg_inv_code
  const activeVariant = colourVariants.find(v => v.colourTag === activeColour) || colourVariants[0] || null

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
        p_next_stage: 'marketing_ready',
        p_user_id: profile.id,
        p_action: 'marked BOM complete — stage advanced to Marketing',
        p_department: 'bom',
      })
      fetch('/api/notify-stage-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: 'marketing_ready' }),
      }).catch(() => {})
    }

    setSaving(false)
    router.refresh()
  }

  return (
    <div className="max-w-5xl space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Bill of Materials</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">Per-colour BOM pre-filled from merchandising Excel.</p>
          </div>
          {data?.is_locked && (
            <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
              <Lock className="h-3 w-3" /> Stage Locked
            </span>
          )}
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
                {colourVariants.map(v => (
                  <button
                    key={v.colourTag}
                    onClick={() => setActiveColour(v.colourTag)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeColour === v.colourTag ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                  >
                    {v.colourTag}
                  </button>
                ))}
              </div>

              {activeVariant && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-700">{activeVariant.colourTag} — components from merchandising Excel</p>
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
