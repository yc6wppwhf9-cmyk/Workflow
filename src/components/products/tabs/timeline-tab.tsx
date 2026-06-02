'use client'

import { useState } from 'react'
import { ArrowRight, Upload, Edit3, CheckCircle2, Unlock, Plus, Filter } from 'lucide-react'
import { getInitials, formatDateTime } from '@/lib/utils'
import type { ActivityLog } from '@/lib/types'
import { cn } from '@/lib/utils'

interface TimelineTabProps {
  logs: ActivityLog[]
}

const DEPT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  admin:         { bg: 'bg-red-50 text-red-700 border-red-200',     text: 'text-red-700',    dot: 'bg-red-500' },
  design:        { bg: 'bg-purple-50 text-purple-700 border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
  merchandising: { bg: 'bg-blue-50 text-blue-700 border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  bom:           { bg: 'bg-orange-50 text-orange-700 border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
  marketing:     { bg: 'bg-yellow-50 text-yellow-700 border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  sales:         { bg: 'bg-green-50 text-green-700 border-green-200', text: 'text-green-700',  dot: 'bg-green-500' },
  viewer:        { bg: 'bg-gray-50 text-gray-600 border-gray-200',   text: 'text-gray-600',   dot: 'bg-gray-400' },
}

function getActionIcon(action: string) {
  if (action.includes('advanced stage') || action.includes('unlocked stage')) return <ArrowRight className="h-3.5 w-3.5" />
  if (action.includes('uploaded')) return <Upload className="h-3.5 w-3.5" />
  if (action.includes('created')) return <Plus className="h-3.5 w-3.5" />
  if (action.includes('completed') || action.includes('live')) return <CheckCircle2 className="h-3.5 w-3.5" />
  if (action.includes('unlocked')) return <Unlock className="h-3.5 w-3.5" />
  return <Edit3 className="h-3.5 w-3.5" />
}

function isStageTransition(action: string) {
  return action.includes('advanced stage') || action.includes('unlocked stage') || action.includes('product_live')
}

function groupByDate(logs: ActivityLog[]) {
  const groups: { label: string; logs: ActivityLog[] }[] = []
  const map = new Map<string, ActivityLog[]>()

  for (const log of logs) {
    const d = new Date(log.created_at)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let key: string
    if (d.toDateString() === today.toDateString()) key = 'Today'
    else if (d.toDateString() === yesterday.toDateString()) key = 'Yesterday'
    else key = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(log)
  }

  for (const [label, logs] of map) {
    groups.push({ label, logs })
  }
  return groups
}

const DEPT_FILTERS = ['All', 'admin', 'design', 'merchandising', 'bom', 'marketing', 'sales']

export function TimelineTab({ logs }: TimelineTabProps) {
  const [activeFilter, setActiveFilter] = useState('All')

  const filtered = activeFilter === 'All' ? logs : logs.filter(l => l.department === activeFilter)
  const groups = groupByDate(filtered)

  return (
    <div className="max-w-3xl space-y-4">

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">Total Events</p>
          <p className="text-xl font-semibold text-gray-900">{logs.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">Departments Active</p>
          <p className="text-xl font-semibold text-gray-900">
            {new Set(logs.map(l => l.department).filter(Boolean)).size}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">Last Updated</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">
            {logs[0] ? new Date(logs[0].created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
          </p>
        </div>
      </div>

      {/* Department filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        {DEPT_FILTERS.map(f => {
          const color = DEPT_COLORS[f]
          const isActive = activeFilter === f
          return (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize',
                isActive
                  ? (f === 'All' ? 'bg-gray-900 text-white border-gray-900' : `${color?.bg} border-current`)
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              )}
            >
              {f === 'All' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'All' && (
                <span className="ml-1 opacity-60">
                  {logs.filter(l => l.department === f).length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Log entries grouped by date */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No activity recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(group => (
            <div key={group.label}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  {group.label}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-300">{group.logs.length} event{group.logs.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Log rows */}
              <div className="space-y-2">
                {group.logs.map(log => {
                  const user = log.user as { full_name?: string } | null
                  const dept = log.department || 'viewer'
                  const color = DEPT_COLORS[dept] || DEPT_COLORS.viewer
                  const isStage = isStageTransition(log.action)

                  return (
                    <div
                      key={log.id}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                        isStage
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-gray-100 hover:border-gray-200'
                      )}
                    >
                      {/* Avatar */}
                      <div className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0',
                        color.dot
                      )}>
                        {getInitials(user?.full_name || 'System')}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">
                            {user?.full_name || 'System'}
                          </span>
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full border capitalize font-medium',
                            color.bg
                          )}>
                            {dept}
                          </span>
                          {isStage && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-medium">
                              Stage Change
                            </span>
                          )}
                        </div>

                        <div className={cn(
                          'flex items-center gap-1.5 mt-1 text-sm',
                          isStage ? 'text-blue-700 font-medium' : 'text-gray-600'
                        )}>
                          <span className={cn('shrink-0', isStage ? 'text-blue-500' : 'text-gray-400')}>
                            {getActionIcon(log.action)}
                          </span>
                          {log.action}
                        </div>

                        {log.field_changed && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 w-fit">
                            <span className="font-medium text-gray-700">{log.field_changed}</span>
                            {log.old_value && (
                              <>
                                <span className="line-through text-red-400">{log.old_value}</span>
                                <ArrowRight className="h-3 w-3 text-gray-300" />
                                <span className="text-green-600">{log.new_value}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400">
                          {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </p>
                        <p className="text-xs text-gray-300 mt-0.5">
                          {new Date(log.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
