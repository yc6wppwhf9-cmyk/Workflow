'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import type { Product, Profile, BomData, BomItem, MerchandisingData } from '@/lib/types'

interface BomTabProps {
  product: Product
  profile: Profile
  data: BomData | null
  merchandisingData: MerchandisingData | null
}

const emptyItem = (): BomItem => ({ inv_name: '', inv_code: '', consumption: '', unit: '' })

export function BomTab({ product, profile, data, merchandisingData }: BomTabProps) {
  const router = useRouter()
  const isRoleAllowed = ['admin', 'bom'].includes(profile.role)
  const canEditFields = !data?.is_locked && !data?.is_completed && isRoleAllowed
  const showActions = !data?.is_locked && isRoleAllowed
  const [items, setItems] = useState<BomItem[]>(data?.items || [])
  const [fgInvCode, setFgInvCode] = useState(data?.fg_inv_code || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeColour, setActiveColour] = useState<string | null>(null)

  const colourVariants = merchandisingData?.colour_variants || []
  const activeVariant = activeColour ? colourVariants.find(v => v.colourTag === activeColour) : null

  function updateItem(i: number, field: keyof BomItem, value: string) {
    setItems(items.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('bom_data').update({ items, fg_inv_code: fgInvCode || null, updated_by: profile.id }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `updated BOM (${items.length} items)`, department: 'bom',
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); router.refresh() }, 2000)
  }

  async function markComplete() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('bom_data').update({ items, is_completed: !data?.is_completed, updated_by: profile.id }).eq('product_id', product.id)
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="max-w-5xl space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Bill of Materials</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">Item names and INV codes pre-filled from merchandising Excel. Add consumption from cutting sheet.</p>
          </div>
          {data?.is_locked && (
            <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
              <Lock className="h-3 w-3" /> Stage Locked
            </span>
          )}
        </CardHeader>
        <CardContent>
          {/* Finished Goods INV Code */}
          <div className="flex items-end gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="space-y-1.5 w-64">
              <Label className="text-xs">Finished Goods INV Code</Label>
              <Input
                placeholder="ERP INV code for this product"
                value={fgInvCode}
                onChange={e => setFgInvCode(e.target.value.toUpperCase())}
                disabled={!canEditFields}
                className="font-mono h-8 text-sm"
              />
            </div>
            {data?.fg_inv_code && (
              <span className="text-xs text-gray-400 pb-1.5">Currently: <span className="font-mono font-medium text-gray-700">{data.fg_inv_code}</span></span>
            )}
          </div>

          {/* Colour tabs */}
          {colourVariants.length > 0 && (
            <div className="flex items-center gap-1 mb-4 border-b border-gray-100 pb-3 flex-wrap">
              <button
                onClick={() => setActiveColour(null)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!activeColour ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
              >
                Master BOM
              </button>
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
          )}

          {/* Colour variant BOM (read-only) */}
          {activeVariant && (
            <div className="rounded-lg border border-blue-200 overflow-hidden">
              <div className="bg-blue-50 px-3 py-2 border-b border-blue-200">
                <p className="text-xs font-semibold text-blue-700">{activeVariant.colourTag} — components from merchandising Excel</p>
                <p className="text-xs text-blue-500 mt-0.5">Read-only. Edit consumption in Master BOM.</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-8">#</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Item Name</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">INV Code</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-24">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(activeVariant.bomItems || []).map((item, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 text-sm text-gray-800">{item.inv_name}</td>
                      <td className="px-3 py-2 text-sm font-mono text-gray-600">{item.inv_code || <span className="text-gray-300">—</span>}</td>
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

          {/* Master BOM (editable) */}
          {!activeVariant && (
            <>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-8">#</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Item Name</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">INV Code</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-32">Consumption</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-24">Unit</th>
                      {canEditFields && <th className="w-10" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, i) => (
                      <tr key={i} className="group">
                        <td className="px-3 py-1.5 text-xs text-gray-400">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={item.inv_name}
                            onChange={e => updateItem(i, 'inv_name', e.target.value)}
                            disabled={!canEditFields}
                            placeholder="e.g. FABRIC 1 - PVC"
                            className="text-xs h-8"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={item.inv_code}
                            onChange={e => updateItem(i, 'inv_code', e.target.value)}
                            disabled={!canEditFields}
                            placeholder="e.g. FB PVC 1680 D 480 NBL"
                            className="font-mono text-xs h-8"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={item.consumption}
                            onChange={e => updateItem(i, 'consumption', e.target.value)}
                            disabled={!canEditFields}
                            placeholder="e.g. 0.5524"
                            className="text-xs h-8"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={item.unit}
                            onChange={e => updateItem(i, 'unit', e.target.value)}
                            disabled={!canEditFields}
                            placeholder="mtr / pcs"
                            className="text-xs h-8"
                          />
                        </td>
                        {canEditFields && (
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => setItems(items.filter((_, j) => j !== i))}
                              className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {items.length === 0 && (
                  <div className="text-center py-10 text-gray-400">
                    <p className="text-sm">No BOM items yet.</p>
                    <p className="text-xs mt-1">Upload the merchandising Excel to pre-fill item names and INV codes.</p>
                  </div>
                )}
              </div>

              {canEditFields && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setItems([...items, emptyItem()])}>
                  <Plus className="h-4 w-4" /> Add Item
                </Button>
              )}

              {saved && (
                <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-4">Changes saved.</p>
              )}
              {showActions && (
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                  {canEditFields && (
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Changes
                    </Button>
                  )}
                  <Button variant="outline" onClick={markComplete} disabled={saving}
                    className={data?.is_completed ? 'text-orange-600 border-orange-200' : 'text-green-600 border-green-200'}
                  >
                    {data?.is_completed ? 'Mark Incomplete' : 'Mark BOM Complete'}
                  </Button>
                  <span className="text-xs text-gray-400">{items.length} items</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
