'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { getInitials, formatDateTime } from '@/lib/utils'
import type { Profile } from '@/lib/types'

interface Comment {
  id: string
  message: string
  created_at: string
  user_id: string
  author_name: string
  author_role: string
}

interface CommentsTabProps {
  productId: string
  profile: Profile
  initialComments: Comment[]
}

const ROLE_COLORS: Record<string, string> = {
  sales:              'bg-rose-100 text-rose-700',
  design:             'bg-blue-100 text-blue-700',
  design_head:        'bg-violet-100 text-violet-700',
  sampling:           'bg-purple-100 text-purple-700',
  merchandising:      'bg-teal-100 text-teal-700',
  merchandising_head: 'bg-teal-100 text-teal-800',
  bom:                'bg-orange-100 text-orange-700',
  marketing:          'bg-pink-100 text-pink-700',
  admin:              'bg-gray-100 text-gray-700',
  management:         'bg-indigo-100 text-indigo-700',
}

export function CommentsTab({ productId, profile, initialComments }: CommentsTabProps) {
  const supabase  = useMemo(() => createClient(), [])
  const router    = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)

  // Real-time subscription
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(`comments:${productId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'product_comments', filter: `product_id=eq.${productId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload.new
          if (row.user_id === profile.id) return // already added optimistically
          setComments(prev => [...prev, {
            id: row.id,
            message: row.message,
            created_at: row.created_at,
            user_id: row.user_id,
            author_name: row.author_name || 'Team member',
            author_role: row.author_role || '',
          }])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [productId, supabase, profile.id])

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  async function sendComment() {
    const msg = text.trim()
    if (!msg || sending) return
    setSending(true)
    setText('')

    // Optimistic add
    const optimistic: Comment = {
      id: `tmp-${Date.now()}`,
      message: msg,
      created_at: new Date().toISOString(),
      user_id: profile.id,
      author_name: profile.full_name,
      author_role: profile.role,
    }
    setComments(prev => [...prev, optimistic])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('product_comments').insert({
      product_id:  productId,
      user_id:     profile.id,
      message:     msg,
      author_name: profile.full_name,
      author_role: profile.role,
    })

    if (error) {
      toast.error('Failed to send comment. Please try again.')
    } else {
      toast.success('Comment sent')
    }
    setSending(false)
    router.refresh()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendComment()
    }
  }

  return (
    <div className="max-w-2xl flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
      {/* Comments list */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No comments yet</p>
            <p className="text-xs mt-1">Start the conversation — ask a question or share an update.</p>
          </div>
        ) : (
          comments.map(c => {
            const isMe = c.user_id === profile.id
            const roleColor = ROLE_COLORS[c.author_role] || 'bg-gray-100 text-gray-600'
            return (
              <div key={c.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                  <AvatarFallback className="bg-gray-200 text-gray-700 text-xs">
                    {getInitials(c.author_name)}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className={`flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs font-semibold text-gray-800">{isMe ? 'You' : c.author_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${roleColor}`}>
                      {c.author_role.replace('_', ' ')}
                    </span>
                  </div>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                  }`}>
                    {c.message}
                  </div>
                  <p className={`text-[11px] text-gray-400 mt-1 ${isMe ? 'text-right' : ''}`}>
                    {formatDateTime(c.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 pt-4 mt-2">
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder="Write a comment… (Enter to send)"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            className="resize-none flex-1 text-sm"
          />
          <Button
            onClick={sendComment}
            disabled={!text.trim() || sending}
            size="sm"
            className="shrink-0 h-10"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">Enter to send · Shift+Enter for new line · visible to all departments</p>
      </div>
    </div>
  )
}
