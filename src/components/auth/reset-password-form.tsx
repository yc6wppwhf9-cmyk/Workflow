'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'

function StrengthBar({ password }: { password: string }) {
  const score = password.length >= 8 ? (password.length >= 12 ? 2 : 1) : 0
  const hasMixed = /[a-z]/.test(password) && /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const total = Math.min(score + (hasMixed ? 1 : 0) + (hasNumber ? 1 : 0), 3)
  const label = ['', 'Weak', 'Fair', 'Strong'][total] || ''
  const color = ['', 'bg-red-400', 'bg-amber-400', 'bg-green-500'][total] || ''
  if (!password) return null
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= total ? color : 'bg-gray-200'}`} />
        ))}
      </div>
      <p className={`text-xs ${total === 3 ? 'text-green-600' : total === 2 ? 'text-amber-600' : 'text-red-500'}`}>{label}</p>
    </div>
  )
}

function ResetPasswordInner() {
  const router   = useRouter()
  const params   = useSearchParams()

  const [verifying, setVerifying] = useState(true)
  const [ready,     setReady]     = useState(false)
  const [linkError, setLinkError] = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [show,      setShow]      = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState('')

  // Use a ref so the timeout can be cleared from inside the auth callback
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolvedRef = useRef(false)

  function resolve(ok: boolean, errMsg?: string) {
    if (resolvedRef.current) return  // only resolve once
    resolvedRef.current = true
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVerifying(false)
    if (ok) setReady(true)
    else setLinkError(errMsg || 'This reset link is invalid or has expired.')
  }

  useEffect(() => {
    const supabase  = createClient()
    const tokenHash = params.get('token_hash')
    const type      = params.get('type')

    // Set up auth state listener first (handles both PKCE and implicit/hash flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        resolve(true)
      }
    })

    if (tokenHash && type === 'recovery') {
      // PKCE flow: token_hash in URL query params
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
        if (error) resolve(false, 'This reset link has expired or has already been used.')
        // On success the onAuthStateChange above fires SIGNED_IN which calls resolve(true)
      })
    } else {
      // Implicit / hash-based flow: Supabase client parses the #fragment automatically
      // and fires PASSWORD_RECOVERY. Give it 15 seconds before giving up.
      timeoutRef.current = setTimeout(() => {
        resolve(false, 'No valid reset token found. The link may have expired.')
      }, 15000)
    }

    return () => {
      subscription.unsubscribe()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => router.push('/login'), 2500)
  }

  if (done) {
    return (
      <Card className="shadow-sm border border-gray-200 bg-white rounded-2xl">
        <CardContent className="px-7 py-10 text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Password updated</p>
            <p className="text-sm text-gray-500 mt-1">Redirecting you to sign in…</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (verifying) {
    return (
      <Card className="shadow-sm border border-gray-200 bg-white rounded-2xl">
        <CardContent className="px-7 py-10 text-center space-y-4">
          <Loader2 className="h-10 w-10 text-blue-400 mx-auto animate-spin" />
          <p className="text-sm text-gray-500">Verifying reset link…</p>
        </CardContent>
      </Card>
    )
  }

  if (linkError) {
    return (
      <Card className="shadow-sm border border-gray-200 bg-white rounded-2xl">
        <CardContent className="px-7 py-10 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
          <div>
            <p className="text-base font-semibold text-gray-900">Link invalid or expired</p>
            <p className="text-sm text-gray-500 mt-1">{linkError}</p>
          </div>
          <a href="/forgot-password" className="inline-block text-sm text-blue-600 hover:underline font-medium">
            Request a new reset link →
          </a>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm border border-gray-200 bg-white rounded-2xl">
      <CardHeader className="pb-4 pt-7 px-7">
        <CardTitle className="text-2xl font-bold text-gray-900">Set new password</CardTitle>
        <CardDescription className="text-sm text-gray-500 mt-0.5">Choose a strong password for your account</CardDescription>
      </CardHeader>
      <CardContent className="px-7 pb-7">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-gray-700">New password</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="h-10 bg-gray-50 border-gray-200 focus:bg-white pr-10"
              />
              <button type="button" onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <StrengthBar password={password} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-sm font-medium text-gray-700">Confirm password</Label>
            <Input
              id="confirm"
              type={show ? 'text' : 'password'}
              placeholder="Repeat new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="h-10 bg-gray-50 border-gray-200 focus:bg-white"
            />
            {confirm && password !== confirm && (
              <p className="text-xs text-red-500">Passwords do not match.</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">{error}</div>
          )}

          <Button type="submit" className="w-full h-10 text-sm font-semibold"
            disabled={loading || !password || password !== confirm}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function ResetPasswordForm() {
  return (
    <Suspense fallback={
      <Card className="shadow-sm border border-gray-200 bg-white rounded-2xl">
        <CardContent className="px-7 py-10 text-center">
          <Loader2 className="h-8 w-8 text-blue-400 mx-auto animate-spin" />
        </CardContent>
      </Card>
    }>
      <ResetPasswordInner />
    </Suspense>
  )
}
