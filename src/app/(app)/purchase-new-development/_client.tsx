'use client'

import { useState } from 'react'
import {
  FileText, ChevronDown, ChevronUp, CheckCircle2,
  User, Calendar, Printer, Scissors,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type DevFile = {
  id: string
  name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  category: string | null
  created_at: string
}

type Development = {
  id: string
  title: string
  remarks: string | null
  status: string
  sent_at: string | null
  created_at: string
  purchase_status: string | null
  purchase_sent_at: string | null
  purchase_remarks: string | null
  creator: { id: string; full_name: string } | null
  sender: { id: string; full_name: string } | null
  files: DevFile[]
}

interface Props {
  developments: Development[]
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileGroup({ files, category, label, icon: Icon, color }: {
  files: DevFile[]
  category: string
  label: string
  icon: React.ElementType
  color: string
}) {
  const list = files.filter(f => f.category === category)
  if (list.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</p>
      </div>
      <div className="space-y-1.5">
        {list.map(f => (
          <div key={f.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <FileText className="h-4 w-4 text-red-400 shrink-0" />
            <a href={f.file_url} target="_blank" rel="noopener noreferrer"
              className="flex-1 text-xs text-blue-600 hover:underline truncate font-medium">
              {f.name}
            </a>
            {f.file_size && <span className="text-xs text-gray-400 shrink-0">{fmtSize(f.file_size)}</span>}
            <a href={f.file_url} target="_blank" rel="noopener noreferrer" download
              className="text-xs text-gray-400 hover:text-blue-600 shrink-0 ml-1 underline">
              Open
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PurchaseNewDevelopmentClient({ developments }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(
    developments.length === 1 ? developments[0].id : null
  )

  if (developments.length === 0) {
    return (
      <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-xl max-w-3xl">
        <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 font-medium">No new developments yet</p>
        <p className="text-xs text-gray-400 mt-1">
          The merchandising team will forward new developments here for procurement.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {developments.map(dev => {
        const isExpanded = expandedId === dev.id
        const creator    = Array.isArray(dev.creator) ? dev.creator[0] : dev.creator
        const sender     = Array.isArray(dev.sender)  ? dev.sender[0]  : dev.sender
        const otherFiles = dev.files.filter(f => !f.category || (f.category !== 'print' && f.category !== 'trim'))

        return (
          <Card key={dev.id} className="border-rose-200">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm font-semibold text-gray-900">{dev.title}</CardTitle>
                    <span className="inline-flex items-center gap-1 text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Received
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {sender && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <User className="h-3 w-3" /> {sender.full_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="h-3 w-3" /> {fmtDate(dev.purchase_sent_at)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {dev.files.length} file{dev.files.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <button
                  className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded shrink-0"
                  onClick={() => setExpandedId(isExpanded ? null : dev.id)}
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pb-4 pt-0 space-y-3">
                {/* Merchandising remarks */}
                {dev.purchase_remarks && (
                  <div className="bg-rose-50 border border-rose-100 rounded-lg px-3 py-2.5">
                    <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-1">
                      Remarks from Merchandising
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{dev.purchase_remarks}</p>
                  </div>
                )}

                {/* Design team original remarks */}
                {dev.remarks && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">
                      Original Remarks from Design {creator ? `(${creator.full_name})` : ''}
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{dev.remarks}</p>
                  </div>
                )}

                {/* Files grouped by category */}
                <div className="space-y-3">
                  <FileGroup files={dev.files} category="print" label="Print Files" icon={Printer} color="text-violet-600" />
                  <FileGroup files={dev.files} category="trim"  label="Trim Files"  icon={Scissors} color="text-teal-600" />
                  {otherFiles.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Other Files</p>
                      <div className="space-y-1.5">
                        {otherFiles.map(f => (
                          <div key={f.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                            <FileText className="h-4 w-4 text-red-400 shrink-0" />
                            <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                              className="flex-1 text-xs text-blue-600 hover:underline truncate font-medium">
                              {f.name}
                            </a>
                            {f.file_size && <span className="text-xs text-gray-400 shrink-0">{fmtSize(f.file_size)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {dev.files.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No files attached.</p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
