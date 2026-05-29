'use server'

import { createClient } from '@/lib/supabase/server'

export async function changePassword(password: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id)

  return {}
}
