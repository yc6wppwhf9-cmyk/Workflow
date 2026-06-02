'use client'

import { usePushNotifications } from '@/hooks/use-push-notifications'

export function PushInitializer() {
  usePushNotifications()
  return null
}
