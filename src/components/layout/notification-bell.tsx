'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils'

interface Notification {
  id: string
  product_id: string | null
  product_name: string | null
  message: string
  is_read: boolean
  created_at: string
}

export function NotificationBell() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const ref      = useRef<HTMLDivElement>(null)

  const [open, setOpen]                   = useState(false)
  const [userId, setUserId]               = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])

  // Resolve current user once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [supabase])

  // Fetch + real-time subscription
  useEffect(() => {
    if (!userId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    db.from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }: { data: Notification[] | null }) => setNotifications(data || []))

    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        'postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => setNotifications(prev => [payload.new as Notification, ...prev]),
      )
      .on(
        'postgres_changes' as never,
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => setNotifications(prev =>
          prev.map(n => n.id === (payload.new as Notification).id ? payload.new as Notification : n)
        ),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase])

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const unread = notifications.filter(n => !n.is_read).length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  async function handleClick(n: Notification) {
    if (!n.is_read) {
      await db.from('notifications').update({ is_read: true }).eq('id', n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }
    if (n.product_id) {
      router.push(`/products/${n.product_id}`)
      setOpen(false)
    }
  }

  async function markAllRead() {
    const ids = notifications.filter(n => !n.is_read).map(n => n.id)
    if (!ids.length) return
    await db.from('notifications').update({ is_read: true }).in('id', ids)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className={`h-5 w-5 ${unread > 0 ? 'text-gray-700' : ''}`} />
        {unread > 0 && (
          <>
            {/* Pulse ring */}
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-400 opacity-75 animate-ping" />
            {/* Badge */}
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {unread > 9 ? '9+' : unread}
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">
              Notifications {unread > 0 && <span className="ml-1 text-xs text-red-500">({unread} new)</span>}
            </span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 ml-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No notifications yet</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/60' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${!n.is_read ? 'bg-blue-500' : 'bg-transparent'}`} />
                    <div className="flex-1 min-w-0">
                      {n.product_name && (
                        <p className="text-xs font-semibold text-gray-900 truncate">{n.product_name}</p>
                      )}
                      <p className="text-xs text-gray-600 leading-snug mt-0.5">{n.message}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{formatDateTime(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
