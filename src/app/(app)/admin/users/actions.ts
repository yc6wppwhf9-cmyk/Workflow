'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

export async function createTeamUser(formData: {
  email: string
  password?: string
  fullName: string
  role: string
}) {
  const cookieStore = await cookies()
  const supabaseSession = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored on server components
          }
        },
      },
    }
  )

  // Verify the calling user is logged in
  const { data: { user: currentUser } } = await supabaseSession.auth.getUser()
  if (!currentUser) {
    return { error: 'Unauthorized: Not logged in' }
  }

  // Verify the calling user is an admin
  const { data: currentProfile } = await supabaseSession
    .from('profiles')
    .select('role')
    .eq('id', currentUser.id)
    .single()

  if (currentProfile?.role !== 'admin') {
    return { error: 'Unauthorized: Only administrators can create users' }
  }

  // Verify that the SUPABASE_SERVICE_ROLE_KEY is set in environment variables
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return {
      error: 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Please add it to your .env.local file to enable server-side admin user creation.'
    }
  }

  // Instantiate the admin client bypassing RLS/Auth constraints
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  // 1. Create the user in Supabase Authentication
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: formData.email,
    password: formData.password || process.env.DEFAULT_USER_PASSWORD || 'Welcome@2026',
    email_confirm: true,
    user_metadata: {
      full_name: formData.fullName,
    },
  })

  if (authError) {
    return { error: `Authentication Error: ${authError.message}` }
  }

  if (!authUser.user) {
    return { error: 'Failed to retrieve newly created user details' }
  }

  // 2. Wait for the auth trigger to create the profile row (up to 5 retries × 400ms)
  let profileExists = false
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 400))
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', authUser.user.id)
      .single()
    if (data) { profileExists = true; break }
  }

  if (!profileExists) {
    return { error: 'Profile row was not created by the database trigger. Check Supabase trigger configuration.' }
  }

  // 3. Update profile role and details in profiles table
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      full_name: formData.fullName,
      role: formData.role,
      must_change_password: true,
    })
    .eq('id', authUser.user.id)

  if (profileError) {
    return { error: `Profile update failed: ${profileError.message}` }
  }

  revalidatePath('/admin/users')
  return { success: true }
}
