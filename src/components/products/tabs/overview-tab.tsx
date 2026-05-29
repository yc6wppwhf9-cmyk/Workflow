'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X } from 'lucide-react'
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

  async function saveDisplayName() {
    setSavingName(true)
    const supabase = createClient()
    await supabase.from('products').update({ display_name: displayName.trim() || null }).eq('id', product.id)
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
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Object.entries(colourGroups).map(([tag, imgs]) => (
                <div key={tag} className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{tag}</p>
                  {imgs.slice(0, 1).map(img => (
                    <a key={img.id} href={img.file_url} target="_blank" rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-50 hover:border-blue-300 transition-colors"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.file_url} alt={tag} className="w-full h-full object-cover" />
                    </a>
                  ))}
                  {imgs.length > 1 && (
                    <p className="text-xs text-gray-400">+{imgs.length - 1} more</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
