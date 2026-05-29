import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { ChangePasswordForm } from './change-password-form'
import { Toaster } from 'sonner'

export default async function ChangePasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, must_change_password')
    .eq('id', user.id)
    .single()

  // Already changed → go to app
  if (!profile?.must_change_password) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/logo.png"
            alt="HSCVPL"
            width={80}
            height={80}
            className="rounded-xl object-contain"
            priority
          />
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-800">High Spirit Commercial Ventures Pvt. Ltd.</p>
            <p className="text-xs text-gray-400 mt-0.5 tracking-wide uppercase">Product Lifecycle Management</p>
          </div>
        </div>

        <ChangePasswordForm userName={profile?.full_name || ''} />

        <p className="text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} HSCVPL. All rights reserved.
        </p>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  )
}
