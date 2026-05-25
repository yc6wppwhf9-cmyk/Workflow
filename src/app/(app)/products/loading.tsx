import { Card, CardContent } from '@/components/ui/card'

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-100 ${className ?? ''}`} />
}

export default function ProductsLoading() {
  return (
    <div>
      <div className="px-6 pt-6 pb-2 flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <div className="p-6">
        <Card>
          <CardContent className="pt-4">
            {/* Table header */}
            <div className="grid grid-cols-5 gap-4 pb-3 border-b border-gray-100">
              {['Product', 'SKU', 'Stage', 'Designer', 'FG INV'].map(col => (
                <Skeleton key={col} className="h-3 w-full" />
              ))}
            </div>
            {/* Table rows */}
            {[...Array(8)].map((_, i) => (
              <div key={i} className="grid grid-cols-5 gap-4 py-4 border-b border-gray-50">
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
                <Skeleton className="h-5 w-3/4 rounded-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-5 w-20 rounded" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
