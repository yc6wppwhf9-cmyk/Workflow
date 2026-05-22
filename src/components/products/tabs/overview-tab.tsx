import { Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STAGE_LABELS, STAGE_COLORS, CATEGORY_LABELS, type WorkflowStage, type ProductCategory, type Product, type DesignData, type MerchandisingData, type BomData, type MarketingData, type SalesData, type ProductFile } from '@/lib/types'
import { formatDate } from '@/lib/utils'

interface OverviewTabProps {
  product: Product
  designData: DesignData | null
  merchandisingData: MerchandisingData | null
  bomData: BomData | null
  marketingData: MarketingData | null
  salesData: SalesData | null
  files: ProductFile[]
}

function CompletionRow({ label, completed }: { label: string; completed: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      {completed
        ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><Check className="h-3.5 w-3.5" /> Complete</span>
        : <span className="flex items-center gap-1 text-xs text-gray-400"><X className="h-3.5 w-3.5" /> Pending</span>
      }
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  )
}

export function OverviewTab({ product, designData, merchandisingData, bomData, marketingData, salesData, files }: OverviewTabProps) {
  const colourSkus = designData?.color_skus || []

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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Product Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Product Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">

              <InfoRow label="Product Name">
                <p className="text-sm font-semibold text-gray-900">{product.name}</p>
              </InfoRow>

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
                <p className="text-sm font-medium text-gray-900">{designData?.channel || '—'}</p>
              </InfoRow>

              <InfoRow label="Current Stage">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STAGE_COLORS[product.workflow_stage as WorkflowStage]}`}>
                  {STAGE_LABELS[product.workflow_stage as WorkflowStage]}
                </span>
              </InfoRow>

              <InfoRow label="Brand">
                <p className="text-sm font-medium text-gray-900">{product.brand || '—'}</p>
              </InfoRow>

              <InfoRow label="Created">
                <p className="text-sm font-medium text-gray-900">{formatDate(product.created_at)}</p>
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

        {/* Department Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Department Status</CardTitle>
          </CardHeader>
          <CardContent>
            <CompletionRow label="Design" completed={designData?.is_completed || false} />
            <CompletionRow label="Merchandising" completed={merchandisingData?.is_completed || false} />
            <CompletionRow label="BOM" completed={bomData?.is_completed || false} />
            <CompletionRow label="Marketing" completed={marketingData?.is_completed || false} />
            <CompletionRow label="Sales" completed={salesData?.is_completed || false} />
          </CardContent>
        </Card>

      </div>

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
