import { redirect } from 'next/navigation'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { AdditionWorkClient, type AdditionWorkItem } from './_client'

export default async function AdditionWorkPage() {
  const profile = await getCurrentProfile()
  if (!profile || !['merchandising_head', 'bom', 'admin'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  // addition_work isn't in the generated DB types yet — cast like new_developments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items } = await (supabase as any)
    .from('addition_work')
    .select('id, name, file_url, file_type, file_size, remarks, inv_codes, inv_note, inv_updated_at, created_at')
    .order('created_at', { ascending: false })

  const canUpload  = ['merchandising_head', 'admin'].includes(profile.role)
  const canRespond = ['bom', 'admin'].includes(profile.role)

  return (
    <div>
      <Header
        title="Addition Work"
        subtitle={canUpload
          ? 'Upload Excel sheets for the BOM team — the BOM team replies with the updated INV.'
          : 'Excel sheets shared by the merchandising head — reply with the updated INV.'}
      />
      <div className="p-4 sm:p-6">
        <AdditionWorkClient
          canUpload={canUpload}
          canRespond={canRespond}
          initialItems={(items as AdditionWorkItem[] | null) || []}
        />
      </div>
    </div>
  )
}
