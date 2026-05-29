import { Card, CardContent, CardHeader } from '@/components/ui/card'

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-100 ${className ?? ''}`} />
}

function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-gray-50">
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="px-6 py-3">
          <Skeleton className={`h-4 ${i === 0 ? 'w-40' : i === cols - 1 ? 'w-16' : 'w-24'}`} />
        </td>
      ))}
    </tr>
  )
}

export default function ManagementLoading() {
  return (
    <div>
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
        <Skeleton className="h-6 w-40 mb-1" />
        <Skeleton className="h-3.5 w-56" />
      </div>

      <div className="p-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-8 w-14" />
                  </div>
                  <Skeleton className="h-12 w-12 rounded-xl" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tables */}
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[...Array(4)].map((_, j) => (
                      <th key={j} className="px-6 py-2">
                        <Skeleton className="h-3 w-16" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...Array(5)].map((_, j) => <TableRowSkeleton key={j} cols={4} />)}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
