'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, CheckCircle2, Edit2, Megaphone, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatShortDate } from '@/lib/utils'

export interface MarketingProduct {
  id: string
  name: string
  category: string | null
  samplerName: string | null
  reviewedAt: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variants: any[]
  deadline: string | null
  samplePhotos: { id: string; url: string; name: string }[]
}

export function MarketingClient({ products: initial }: { products: MarketingProduct[] }) {
  const [products, setProducts] = useState(initial)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  function startEdit(id: string, current: string) {
    setEditing(e => ({ ...e, [id]: current }))
  }

  function cancelEdit(id: string) {
    setEditing(e => { const n = { ...e }; delete n[id]; return n })
  }

  async function saveName(id: string) {
    const name = editing[id]?.trim()
    if (!name) return
    setSaving(id)
    try {
      const res = await fetch('/api/update-product-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: id, name }),
      })
      if (!res.ok) throw new Error('Failed')
      setProducts(ps => ps.map(p => p.id === id ? { ...p, name } : p))
      cancelEdit(id)
      toast.success('Product name updated')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setSaving(null)
    }
  }

  if (products.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <Megaphone className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">No approved samples yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Products appear here once their physical samples are approved.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-sm text-gray-500">
        {products.length} product{products.length !== 1 ? 's' : ''} with approved samples
      </p>

      {products.map(p => {
        const variantImages = p.variants
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((v: any) => v.variant_image_url)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((v: any) => ({
            url: v.variant_image_url as string,
            label: (v.colour_name || v.color_name || 'Variant') as string,
          }))

        const isEditingThis = p.id in editing
        const editName = editing[p.id] ?? ''

        return (
          <Card key={p.id} className="overflow-hidden">
            <CardContent className="p-5 space-y-4">

              {/* Sample photos */}
              {p.samplePhotos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Sample Photos
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {p.samplePhotos.map(f => (
                      <a
                        key={f.id}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={f.url}
                          alt={f.name}
                          className="h-40 w-40 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Variant reference images */}
              {variantImages.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Variant Reference Images
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {variantImages.map((v, i) => (
                      <div key={i} className="shrink-0 text-center">
                        <a href={v.url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={v.url}
                            alt={v.label}
                            className="h-32 w-32 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition"
                          />
                        </a>
                        <p className="text-xs text-gray-500 mt-1 truncate w-32">{v.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                {p.category && (
                  <span className="capitalize">{p.category.replace(/_/g, ' ')}</span>
                )}
                {p.deadline && (
                  <span>Deadline: {formatShortDate(p.deadline)}</span>
                )}
                {p.samplerName && (
                  <span>Sampler: {p.samplerName}</span>
                )}
                {p.reviewedAt && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> Sample approved
                  </span>
                )}
              </div>

              {/* Name edit row */}
              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                {isEditingThis ? (
                  <>
                    <Input
                      value={editName}
                      onChange={e => setEditing(ed => ({ ...ed, [p.id]: e.target.value }))}
                      className="h-8 text-sm flex-1 max-w-xs"
                      placeholder="Enter official product name…"
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveName(p.id)
                        if (e.key === 'Escape') cancelEdit(p.id)
                      }}
                      autoFocus
                      disabled={saving === p.id}
                    />
                    <Button
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() => saveName(p.id)}
                      disabled={saving === p.id}
                    >
                      <Check className="h-3 w-3" />
                      {saving === p.id ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => cancelEdit(p.id)}
                      disabled={saving === p.id}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-gray-900 flex-1 min-w-0 truncate">
                      {p.name}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs shrink-0"
                      onClick={() => startEdit(p.id, p.name)}
                    >
                      <Edit2 className="h-3 w-3" />
                      Rename
                    </Button>
                  </>
                )}
                <Link
                  href={`/products/${p.id}?tab=sampling`}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap shrink-0"
                >
                  View product <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
