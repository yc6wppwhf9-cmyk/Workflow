import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { PurchaseNewDevelopmentClient } from './_client'
import type { Profile } from '@/lib/types'

export default async function PurchaseNewDevelopmentPage() {
  const supabase = await createClient()
  const profile  = await getCurrentProfile() as Profile

  if (!['purchase_head', 'admin', 'management'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data: developments } = await (supabase as any)
    .from('new_developments')
    .select(`
      id, title, remarks, status, sent_at, created_at,
      purchase_status, purchase_sent_at, purchase_remarks,
      creator:profiles!created_by(id, full_name),
      sender:profiles!purchase_sent_by(id, full_name),
      files:new_development_files(id, name, file_url, file_type, file_size, category, created_at)
    `)
    .eq('purchase_status', 'sent')
    .order('purchase_sent_at', { ascending: false })

  return (
    <div>
      <Header
        title="New Development"
        subtitle={
          developments?.length
            ? `${developments.length} development${developments.length !== 1 ? 's' : ''} received from merchandising team`
            : 'No new developments received yet'
        }
      />
      <div className="p-4 sm:p-6">
        <PurchaseNewDevelopmentClient developments={developments || []} />
      </div>
    </div>
  )
}
