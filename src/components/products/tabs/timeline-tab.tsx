import { formatDateTime } from '@/lib/utils'
import { getInitials } from '@/lib/utils'
import type { ActivityLog } from '@/lib/types'

interface TimelineTabProps {
  logs: ActivityLog[]
}

const DEPARTMENT_COLORS: Record<string, string> = {
  admin: 'bg-red-500',
  design: 'bg-purple-500',
  merchandising: 'bg-blue-500',
  bom: 'bg-orange-500',
  marketing: 'bg-yellow-500',
  sales: 'bg-green-500',
  viewer: 'bg-gray-400',
}

export function TimelineTab({ logs }: TimelineTabProps) {
  return (
    <div className="max-w-2xl">
      <div className="space-y-0">
        {logs.map((log, i) => {
          const user = log.user as { full_name?: string } | null
          const dept = log.department || 'viewer'
          const color = DEPARTMENT_COLORS[dept] || 'bg-gray-400'

          return (
            <div key={log.id} className="flex gap-4 group">
              {/* Timeline line + dot */}
              <div className="flex flex-col items-center">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${color}`} />
                {i < logs.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
              </div>

              {/* Content */}
              <div className="pb-5 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{user?.full_name || 'System'}</span>
                      {' '}{log.action}
                    </p>
                    {log.field_changed && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Field: <span className="font-medium">{log.field_changed}</span>
                        {log.old_value && <> · <span className="line-through">{log.old_value}</span> → {log.new_value}</>}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {log.department && (
                        <span className={`text-xs px-1.5 py-0.5 rounded text-white capitalize ${color}`}>
                          {log.department}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5">{formatDateTime(log.created_at)}</span>
                </div>
              </div>
            </div>
          )
        })}

        {logs.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">No activity recorded yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
