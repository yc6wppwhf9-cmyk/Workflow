import Image from 'next/image'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="HSCVPL" width={96} height={96} className="object-contain" priority />
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-800 leading-tight">High Spirit Commercial Ventures Pvt. Ltd.</p>
            <p className="text-xs text-gray-400 mt-0.5 tracking-wide uppercase">Product Lifecycle Management</p>
          </div>
        </div>
        <ResetPasswordForm />
        <p className="text-center text-xs text-gray-400">&copy; {new Date().getFullYear()} HSCVPL. All rights reserved.</p>
      </div>
    </div>
  )
}
