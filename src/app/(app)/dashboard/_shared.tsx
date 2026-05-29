import { Card, CardContent } from '@/components/ui/card'
import { STAGE_COLORS, STAGE_LABELS, type WorkflowStage } from '@/lib/types'
import Link from 'next/link'

export function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage as WorkflowStage] || 'bg-gray-100 text-gray-600'
  const label = STAGE_LABELS[stage as WorkflowStage] || stage
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
}

export function KpiCard({ label, value, sub, icon: Icon, color, href, active }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string; href?: string; active?: boolean
}) {
  const inner = (
    <Card className={active ? 'ring-2 ring-blue-500 shadow-md' : href ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}
