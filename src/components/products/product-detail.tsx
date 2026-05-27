'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { WorkflowBar } from '@/components/workflow/workflow-bar'
import { OverviewTab } from '@/components/products/tabs/overview-tab'
import { DesignTab } from '@/components/products/tabs/design-tab'
import { MerchandisingTab } from '@/components/products/tabs/merchandising-tab'
import { BomTab } from '@/components/products/tabs/bom-tab'
import { MarketingTab } from '@/components/products/tabs/marketing-tab'
import { SalesTab } from '@/components/products/tabs/sales-tab'
import { TimelineTab } from '@/components/products/tabs/timeline-tab'
import { ColourVariantsTab } from '@/components/products/tabs/colour-variants-tab'
import { cn } from '@/lib/utils'
import type {
  Product, Profile, DesignData, MerchandisingData,
  BomData, MarketingData, SalesData, ProductFile, ActivityLog,
} from '@/lib/types'

interface ProductDetailProps {
  product: Product
  profile: Profile
  designData: DesignData | null
  merchandisingData: MerchandisingData | null
  bomData: BomData | null
  marketingData: MarketingData | null
  salesData: SalesData | null
  files: ProductFile[]
  logs: ActivityLog[]
  defaultTab?: string
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'sales', label: 'Sales' },
  { value: 'design', label: 'Design' },
  { value: 'merchandising', label: 'Merchandising' },
  { value: 'colours', label: 'Colours' },
  { value: 'bom', label: 'BOM' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'timeline', label: 'Timeline' },
]

const VALID_TABS = new Set(TABS.map(t => t.value))

export function ProductDetail({
  product, profile, designData, merchandisingData,
  bomData, marketingData, salesData, files, logs,
  defaultTab,
}: ProductDetailProps) {
  const initialTab = defaultTab && VALID_TABS.has(defaultTab) ? defaultTab : 'overview'
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`product-${product.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `id=eq.${product.id}` },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'design_data', filter: `product_id=eq.${product.id}` },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchandising_data', filter: `product_id=eq.${product.id}` },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bom_data', filter: `product_id=eq.${product.id}` },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'marketing_data', filter: `product_id=eq.${product.id}` },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales_data', filter: `product_id=eq.${product.id}` },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_files', filter: `product_id=eq.${product.id}` },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_logs', filter: `product_id=eq.${product.id}` },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [product.id, router])

  return (
    <div>
      <WorkflowBar
        product={product}
        profile={profile}
        designData={designData}
        merchandisingData={merchandisingData}
        bomData={bomData}
        marketingData={marketingData}
        salesData={salesData}
      />

      <TabsPrimitive.Root defaultValue={initialTab}>
        <div className="border-b border-gray-200 bg-white px-6">
          <TabsPrimitive.List className="flex gap-0 -mb-px">
            {TABS.map((tab) => (
              <TabsPrimitive.Trigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  'data-[state=active]:border-blue-600 data-[state=active]:text-blue-600',
                  'data-[state=inactive]:border-transparent data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700'
                )}
              >
                {tab.label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
        </div>

        <div className="p-6">
          <TabsPrimitive.Content value="overview">
            <OverviewTab product={product} designData={designData} merchandisingData={merchandisingData} bomData={bomData} marketingData={marketingData} salesData={salesData} files={files} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="design">
            <DesignTab product={product} profile={profile} data={designData} files={files} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="merchandising">
            <MerchandisingTab product={product} profile={profile} data={merchandisingData} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="colours">
            <ColourVariantsTab
              variants={merchandisingData?.colour_variants || []}
              files={files}
            />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="bom">
            <BomTab product={product} profile={profile} data={bomData} merchandisingData={merchandisingData} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="marketing">
            <MarketingTab product={product} profile={profile} data={marketingData} files={files} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="sales">
            <SalesTab product={product} profile={profile} data={salesData} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="timeline">
            <TimelineTab logs={logs} />
          </TabsPrimitive.Content>
        </div>
      </TabsPrimitive.Root>
    </div>
  )
}
