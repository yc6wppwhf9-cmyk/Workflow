import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Toaster } from 'sonner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (!profile.is_active) redirect('/login?reason=deactivated')
  if (profile.must_change_password) redirect('/change-password')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} />
      <main className="flex-1 overflow-auto min-w-0 pt-14 lg:pt-0">
        {children}
      </main>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  )
}
