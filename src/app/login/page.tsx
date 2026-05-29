import Image from 'next/image'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/logo.png"
            alt="HSCVPL Logo"
            width={120}
            height={120}
            className="object-contain mb-4"
            priority
          />
          <h1 className="text-2xl font-bold text-gray-900">PLM System</h1>
          <p className="text-gray-500 text-sm mt-1">Product Lifecycle Management</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
