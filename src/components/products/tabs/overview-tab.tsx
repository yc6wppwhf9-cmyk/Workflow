import { Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { STAGE_LABELS, STAGE_COLORS, type WorkflowStage, type Product, type DesignData, type MerchandisingData, type BomData, type MarketingData, type SalesData } from '@/lib/types'
import { formatDate } from '@/lib/utils'

interface OverviewTabProps {
  product: Product
  designData: DesignData | null
  merchandisingData: MerchandisingData | null
  bomData: BomData | null
  marketingData: MarketingData | null
  salesData: SalesData | null
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

export function OverviewTab({ product, designData, merchandisingData, bomData, marketingData, salesData }: OverviewTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Product Info */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Product Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4">
          {[
            { label: 'Product Name', value: product.name },
            { label: 'SKU', value: product.sku, mono: true },
            { label: 'Category', value: product.category, capitalize: true },
            { label: 'Created', value: formatDate(product.created_at) },
            { label: 'Current Stage', value: STAGE_LABELS[product.workflow_stage as WorkflowStage], badge: true },
            { label: 'Description', value: product.description || '—', full: true },
          ].map(({ label, value, mono, capitalize, badge, full }) => (
            <div key={label} className={full ? 'col-span-2' : ''}>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              {badge
                ? <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STAGE_COLORS[product.workflow_stage as WorkflowStage]}`}>{value}</span>
                : <p className={`text-sm font-medium text-gray-900 ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''}`}>{value}</p>
              }
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Completion checklist */}
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
  )
}
