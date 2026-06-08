'use client'

import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { WorkflowBar } from '@/components/workflow/workflow-bar'
import { OverviewTab } from '@/components/products/tabs/overview-tab'
import { DesignTab } from '@/components/products/tabs/design-tab'
import { SamplingTab } from '@/components/products/tabs/sampling-tab'
import { MerchandisingTab } from '@/components/products/tabs/merchandising-tab'
import { BomTab } from '@/components/products/tabs/bom-tab'
import { MarketingTab } from '@/components/products/tabs/marketing-tab'
import { SalesTab } from '@/components/products/tabs/sales-tab'
import { TimelineTab } from '@/components/products/tabs/timeline-tab'
import { CommentsTab } from '@/components/products/tabs/comments-tab'
import { ColourVariantsTab } from '@/components/products/tabs/colour-variants-tab'
import { cn } from '@/lib/utils'
import type {
  Product, Profile, DesignData, SamplingData, MerchandisingData,
  BomData, MarketingData, SalesData, ProductFile, ActivityLog, DesignSubmission,
} from '@/lib/types'

interface ProductDetailProps {
  product: Product
  profile: Profile
  designData: DesignData | null
  samplingData: SamplingData | null
  merchandisingData: MerchandisingData | null
  bomData: BomData | null
  marketingData: MarketingData | null
  salesData: SalesData | null
  files: ProductFile[]
  logs: ActivityLog[]
  designSubmissions: DesignSubmission[]
  designers: Pick<Profile, 'id' | 'full_name'>[]
  designerWorkloads: Record<string, number>
  merchandisingUsers: Pick<Profile, 'id' | 'full_name'>[]
  samplingUsers: Pick<Profile, 'id' | 'full_name'>[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  comments: any[]
  defaultTab?: string
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'sales', label: 'Sales' },
  { value: 'design', label: 'Design' },
  { value: 'sampling', label: 'Sampling' },
  { value: 'merchandising', label: 'Merchandising' },
  { value: 'colours', label: 'Colours' },
  { value: 'bom', label: 'BOM' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'timeline',  label: 'Timeline'  },
  { value: 'comments',  label: 'Comments'  },
]

const VALID_TABS = new Set(TABS.map(t => t.value))

export function ProductDetail({
  product, profile, designData, samplingData, merchandisingData,
  bomData, marketingData, salesData, files, logs,
  designSubmissions, designers, designerWorkloads, merchandisingUsers, samplingUsers, comments,
  defaultTab,
}: ProductDetailProps) {
  const initialTab = defaultTab && VALID_TABS.has(defaultTab) ? defaultTab : 'overview'
  const [activeTab, setActiveTab] = useState(initialTab)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [deleteOpen, setDeleteOpen]   = useState(false)
  const [deleting,   setDeleting]     = useState(false)
  const canDelete = ['admin', 'design_head'].includes(profile.role)

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/delete-product?product_id=${product.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) router.push('/products')
  }

  const debouncedRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), 300)
  }, [router])

  useEffect(() => {
    const WATCHED_TABLES = [
      { table: 'products',           filter: `id=eq.${product.id}` },
      { table: 'design_data',        filter: `product_id=eq.${product.id}` },
      { table: 'sampling_data',      filter: `product_id=eq.${product.id}` },
      { table: 'merchandising_data', filter: `product_id=eq.${product.id}` },
      { table: 'bom_data',           filter: `product_id=eq.${product.id}` },
      { table: 'marketing_data',     filter: `product_id=eq.${product.id}` },
      { table: 'sales_data',         filter: `product_id=eq.${product.id}` },
      { table: 'product_files',      filter: `product_id=eq.${product.id}` },
      { table: 'activity_logs',      filter: `product_id=eq.${product.id}` },
    ]

    let channel = supabase.channel(`product-${product.id}`)
    for (const { table, filter } of WATCHED_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        debouncedRefresh
      )
    }
    channel.subscribe()

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      supabase.removeChannel(channel)
    }
  }, [product.id, supabase, debouncedRefresh])

  return (
    <div>
      <WorkflowBar
        product={product}
        profile={profile}
        designData={designData}
        samplingData={samplingData}
        merchandisingData={merchandisingData}
        bomData={bomData}
        marketingData={marketingData}
        salesData={salesData}
        onTabChange={setActiveTab}
      />

      {canDelete && (
        <>
          <div className="flex justify-end px-4 sm:px-6 pt-3">
            <button
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Product
            </button>
          </div>
          <ConfirmDialog
            open={deleteOpen}
            title="Delete this product?"
            description={`"${product.display_name || product.name}" and all its data (design, sampling, files, BOM, etc.) will be permanently deleted. This cannot be undone.`}
            confirmLabel="Yes, Delete"
            loading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setDeleteOpen(false)}
          />
        </>
      )}

      <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab}>
        <div className="border-b border-gray-200 bg-white overflow-x-auto">
          <TabsPrimitive.List className="flex gap-0 -mb-px px-4 sm:px-6 min-w-max">
            {TABS.map((tab) => (
              <TabsPrimitive.Trigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  'px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  'data-[state=active]:border-blue-600 data-[state=active]:text-blue-600',
                  'data-[state=inactive]:border-transparent data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700'
                )}
              >
                {tab.label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
        </div>

        <div className="p-4 sm:p-6">
          <TabsPrimitive.Content value="overview">
            <OverviewTab product={product} designData={designData} merchandisingData={merchandisingData} bomData={bomData} marketingData={marketingData} salesData={salesData} files={files} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="design">
            <DesignTab product={product} profile={profile} data={designData} samplingData={samplingData} salesData={salesData} files={files} submissions={designSubmissions} designers={designers} designerWorkloads={designerWorkloads} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="sampling">
            <SamplingTab product={product} profile={profile} designData={designData} data={samplingData} files={files} samplingUsers={samplingUsers} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="merchandising">
            <MerchandisingTab product={product} profile={profile} data={merchandisingData} merchandisingUsers={merchandisingUsers} designData={designData} />
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
          <TabsPrimitive.Content value="comments">
            <CommentsTab productId={product.id} profile={profile} initialComments={comments} />
          </TabsPrimitive.Content>
        </div>
      </TabsPrimitive.Root>
    </div>
  )
}
