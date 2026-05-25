import { Card, CardContent, CardHeader } from '@/components/ui/card'

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-100 ${className ?? ''}`} />
}

export default function ProductDetailLoading() {
  return (
    <div>
      <div className="px-6 pt-6 pb-2 space-y-1.5">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Workflow bar */}
      <div className="px-6 py-3 flex gap-2">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-8 flex-1 rounded-full" />
        ))}
      </div>

      {/* Tab bar */}
      <div className="px-6 flex gap-2 border-b border-gray-100 pb-0">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-t" />
        ))}
      </div>

      <div className="p-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
