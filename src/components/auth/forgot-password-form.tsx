'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

export function ForgotPasswordForm() {
  const [email, setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/reset-password`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <Card className="shadow-sm border border-gray-200 bg-white rounded-2xl">
        <CardContent className="px-7 py-10 text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Check your inbox</p>
            <p className="text-sm text-gray-500 mt-1">
              A password reset link has been sent to <strong>{email}</strong>.
              It will expire in 1 hour.
            </p>
          </div>
          <Link href="/login" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm border border-gray-200 bg-white rounded-2xl">
      <CardHeader className="pb-4 pt-7 px-7">
        <CardTitle className="text-2xl font-bold text-gray-900">Reset password</CardTitle>
        <CardDescription className="text-sm text-gray-500 mt-0.5">
          Enter your work email and we&apos;ll send a reset link
        </CardDescription>
      </CardHeader>
      <CardContent className="px-7 pb-7">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@hscvpl.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-10 bg-gray-50 border-gray-200 focus:bg-white"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full h-10 text-sm font-semibold" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>

          <div className="text-center">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
