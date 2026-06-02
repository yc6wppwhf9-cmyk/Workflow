import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function initVapid() {
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_CONTACT_EMAIL ?? 'mailto:hscvplmybiz@gmail.com', pub, priv)
  return true
}

export async function sendPushToUser(userId: string, payload: {
  title: string
  body: string
  url?: string
  tag?: string
}) {
  const { data: subs } = await adminSupabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs || subs.length === 0) return
  if (!initVapid()) return

  const message = JSON.stringify(payload)

  await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
      ).catch(async err => {
        // Remove expired/invalid subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await adminSupabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      })
    )
  )
}

export async function sendPushToRole(role: string | string[], payload: {
  title: string
  body: string
  url?: string
  tag?: string
}) {
  const roles = Array.isArray(role) ? role : [role]
  const { data: users } = await adminSupabase
    .from('profiles')
    .select('id')
    .in('role', roles)
    .eq('is_active', true)

  if (!users) return
  await Promise.allSettled(users.map(u => sendPushToUser(u.id, payload)))
}
