'use client'

import { useState } from 'react'
import { Users, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

export function SeedUsersButton() {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ email: string; status: string }[] | null>(null)
  const [error, setError]     = useState('')

  async function handleSeed() {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/seed-users')
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); setLoading(false); return }
      setResults(data.results)
    } catch {
      setError('Network error — please try again')
    }
    setLoading(false)
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="border-blue-200 text-blue-700 hover:bg-blue-50">
        <Users className="h-4 w-4 mr-1.5" />
        Import Team
      </Button>

      <Dialog open={open} onOpenChange={v => { if (!loading) { setOpen(v); if (!v) setResults(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Team Members</DialogTitle>
            <DialogDescription>
              Creates all 15 team members with role and password <strong>Welcome@2026</strong>. They will be asked to set a new password on first login.
            </DialogDescription>
          </DialogHeader>

          {!results ? (
            <>
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}
              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
                <Button onClick={handleSeed} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Creating…</> : 'Import All'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto text-sm">
              {results.map(r => (
                <div key={r.email} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-700">{r.email}</span>
                  {r.status === 'OK'
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    : <span className="text-xs text-red-500 shrink-0 max-w-[160px] text-right">{r.status}</span>
                  }
                </div>
              ))}
              <DialogFooter className="pt-3">
                <Button onClick={() => { setOpen(false); setResults(null) }}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
