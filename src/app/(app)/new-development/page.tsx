import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { NewDevelopmentClient } from './_client'
import type { Profile } from '@/lib/types'

export default async function NewDevelopmentPage() {
  const supabase = await createClient()
  const profile  = await getCurrentProfile() as Profile

  if (!['design_head', 'design', 'admin', 'merchandising_head', 'merchandising'].includes(profile.role)) {
    redirect('/dashboard')
  }

  // Design head + merchandising_head see all; design team sees only their own
  let query = (supabase as any)
    .from('new_developments')
    .select(`
      id, title, remarks, status, sent_at, created_at,
      creator:profiles!created_by(id, full_name),
      files:new_development_files(id, name, file_url, file_type, file_size, category, created_at)
    `)
    .order('created_at', { ascending: false })

  // Design team, merchandising, and merchandising head see only their own developments
  if (['design', 'merchandising_head', 'merchandising'].includes(profile.role)) {
    query = query.eq('created_by', profile.id)
  }

  const { data: developments } = await query

  return (
    <div>
      <Header
        title="New Development"
        subtitle={profile.role === 'merchandising_head'
          ? 'Create a new development and notify a recipient by email.'
          : 'Upload PDFs and send new developments to the merchandising team'}
      />
      <div className="p-4 sm:p-6">
        <NewDevelopmentClient
          profile={profile}
          initialDevelopments={developments || []}
        />
      </div>
    </div>
  )
}
