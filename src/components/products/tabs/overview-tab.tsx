'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_LABELS, type ProductCategory, type Product, type DesignData, type MerchandisingData, type BomData, type MarketingData, type SalesData, type ProductFile } from '@/lib/types'

interface OverviewTabProps {
  product: Product
  designData: DesignData | null
  merchandisingData: MerchandisingData | null
  bomData: BomData | null
  marketingData: MarketingData | null
  salesData: SalesData | null
  files: ProductFile[]
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  )
}

export function OverviewTab({ product, designData, bomData, salesData, files }: OverviewTabProps) {
  const router    = useRouter()
  const colourSkus = designData?.color_skus || []

  const [editingName, setEditingName] = useState(false)
  const [displayName, setDisplayName] = useState(product.display_name || '')
  const [savingName, setSavingName]   = useState(false)

  // Lightbox state
  const [lightbox, setLightbox] = useState<{ imgs: ProductFile[]; idx: number } | null>(null)
  function openLightbox(imgs: ProductFile[], idx: number) { setLightbox({ imgs, idx }) }
  function closeLightbox() { setLightbox(null) }
  function prevImg() { setLightbox(lb => lb && lb.idx > 0 ? { ...lb, idx: lb.idx - 1 } : lb) }
  function nextImg() { setLightbox(lb => lb && lb.idx < lb.imgs.length - 1 ? { ...lb, idx: lb.idx + 1 } : lb) }

  async function saveDisplayName() {
    setSavingName(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('products').update({ display_name: displayName.trim() || null }).eq('id', product.id)
    setSavingName(false)
    setEditingName(false)
    router.refresh()
  }

  // Group merch images by colour_tag
  const colourImages = files.filter(f => f.colour_tag && f.file_type?.startsWith('image/') && f.department === 'merchandising')
  const colourGroups = colourImages.reduce<Record<string, ProductFile[]>>((acc, f) => {
    const tag = f.colour_tag!
    if (!acc[tag]) acc[tag] = []
    acc[tag].push(f)
    return acc
  }, {})

  return (
    <div className="space-y-6">

      {/* Product Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4">

            <InfoRow label="Product Name">
              <p className="text-sm font-semibold text-gray-900 break-words">{product.name}</p>
            </InfoRow>

            {/* Editable short display name */}
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs text-gray-500 mb-1">Short Name <span className="text-gray-400">(alias)</span></p>
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="e.g. Nike Bag Red"
                    className="h-7 text-sm py-0"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveDisplayName()
                      if (e.key === 'Escape') setEditingName(false)
                    }}
                  />
                  <button onClick={saveDisplayName} disabled={savingName}
                    className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingName(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group">
                  <p className="text-sm font-medium text-gray-900">
                    {product.display_name || <span className="text-gray-400 italic">Not set</span>}
                  </p>
                  <button
                    onClick={() => setEditingName(true)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600 p-0.5 rounded"
                    title="Edit short name"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <InfoRow label="Designer Name">
              <p className="text-sm font-medium text-gray-900">{designData?.designer_name || '—'}</p>
            </InfoRow>

            <InfoRow label="Category">
              <p className="text-sm font-medium text-gray-900">
                {CATEGORY_LABELS[product.category as ProductCategory] || product.category}
              </p>
            </InfoRow>

            <InfoRow label="FG INV Code">
              <p className="text-sm font-mono font-medium text-gray-900">{bomData?.fg_inv_code || '—'}</p>
            </InfoRow>

            <InfoRow label="Channel">
              <p className="text-sm font-medium text-gray-900">{salesData?.channel || '—'}</p>
            </InfoRow>

            <InfoRow label="Brand">
              <p className="text-sm font-medium text-gray-900">{product.brand || '—'}</p>
            </InfoRow>

          </div>

          {/* Colour SKUs */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Colour SKUs</p>
            {colourSkus.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {colourSkus.map((sku, i) => (
                  <span key={i} className="text-xs font-mono bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{sku}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">—</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Colour-wise product images */}
      {Object.keys(colourGroups).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Colour Variants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(colourGroups).map(([tag, imgs]) => (
              <div key={tag}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">{tag}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                  {imgs.map((img, idx) => (
                    <button
                      key={img.id}
                      onClick={() => openLightbox(imgs, idx)}
                      className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-50 hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.file_url} alt={`${tag} ${idx + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Counter */}
          <p className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightbox.idx + 1} / {lightbox.imgs.length}
          </p>

          {/* Prev */}
          {lightbox.idx > 0 && (
            <button
              onClick={e => { e.stopPropagation(); prevImg() }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}

          {/* Image */}
          <div onClick={e => e.stopPropagation()} className="max-w-4xl max-h-[85vh] flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.imgs[lightbox.idx].file_url}
              alt=""
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Next */}
          {lightbox.idx < lightbox.imgs.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); nextImg() }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          )}
        </div>
      )}

    </div>
  )
}
