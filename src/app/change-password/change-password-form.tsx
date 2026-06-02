'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { changePassword } from './actions'

export function ChangePasswordForm({ userName }: { userName: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const firstName = userName.split(' ')[0]

  const strength = (() => {
    if (password.length === 0) return null
    if (password.length < 6) return 'weak'
    if (password.length < 10 || !/[0-9]/.test(password)) return 'fair'
    return 'strong'
  })()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const result = await changePassword(password)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
          <ShieldCheck className="h-7 w-7 text-green-600" />
        </div>
        <p className="text-base font-semibold text-gray-900">Password updated!</p>
        <p className="text-sm text-gray-500">Taking you to the dashboard…</p>
      </div>
    )
  }

  return (
    <Card className="w-full max-w-sm rounded-2xl shadow-sm border-gray-200 px-1">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Set your password</CardTitle>
        <CardDescription>
          Hi {firstName}, this is your first login. Please set a new password to continue.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-10 bg-gray-50 border-gray-200 focus:bg-white pr-10"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {strength && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex gap-1">
                  {(['weak', 'fair', 'strong'] as const).map((s, i) => (
                    <div
                      key={s}
                      className={`h-1 w-8 rounded-full transition-colors ${
                        i < (['weak', 'fair', 'strong'].indexOf(strength) + 1)
                          ? strength === 'weak' ? 'bg-red-400'
                            : strength === 'fair' ? 'bg-yellow-400'
                            : 'bg-green-500'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-xs font-medium capitalize ${
                  strength === 'weak' ? 'text-red-500' : strength === 'fair' ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {strength}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input
              id="confirm"
              type={showPw ? 'text' : 'password'}
              placeholder="Repeat the password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="h-10 bg-gray-50 border-gray-200 focus:bg-white"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full h-10 bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating…</>
            ) : 'Set Password & Continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
