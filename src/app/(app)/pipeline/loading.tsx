import { Card, CardContent, CardHeader } from '@/components/ui/card'

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-100 ${className ?? ''}`} />
}

function MilestoneRowSkeleton() {
  return (
    <div className="flex gap-3 pb-4">
      <div className="flex flex-col items-center">
        <Skeleton className="h-6 w-6 rounded-full shrink-0" />
        <div className="w-px flex-1 bg-gray-100 mt-1" />
      </div>
      <div className="flex-1 space-y-1.5 pt-0.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-2.5 w-16" />
      </div>
    </div>
  )
}

function DeptSkeleton() {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 pt-3 pb-2">
      <Skeleton className="h-2.5 w-20 mb-3" />
      {[...Array(3)].map((_, i) => <MilestoneRowSkeleton key={i} />)}
    </div>
  )
}

export default function PipelineLoading() {
  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
        <Skeleton className="h-6 w-40 mb-1" />
        <Skeleton className="h-3.5 w-64" />
      </div>

      {/* Index bar */}
      <div className="sticky top-[73px] bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-6 w-40 rounded-full" />
      </div>

      <div className="p-6 space-y-6">
        {[...Array(2)].map((_, pi) => (
          <div key={pi} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Product header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-28" />
            </div>
            {/* Milestone grid */}
            <div className="overflow-x-auto">
              <div className="grid grid-cols-6 gap-3 p-4 min-w-[860px]">
                {[...Array(6)].map((_, i) => <DeptSkeleton key={i} />)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
