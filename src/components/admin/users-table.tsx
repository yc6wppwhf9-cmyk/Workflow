'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, X, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABELS, ROLE_COLORS, STAGE_LABELS, type UserRole, type WorkflowStage } from '@/lib/types'
import { getInitials, formatDate } from '@/lib/utils'

interface User {
  id: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
}

interface UnlockRequest {
  id: string
  stage: WorkflowStage
  reason: string | null
  created_at: string
  requester?: { full_name: string; email: string } | null
  product?: { name: string; sku: string } | null
}

interface UsersTableProps {
  users: User[]
  unlockRequests: UnlockRequest[]
  adminId: string
}

export function UsersTable({ users: initialUsers, unlockRequests: initialRequests, adminId }: UsersTableProps) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [requests, setRequests] = useState(initialRequests)
  const [loading, setLoading] = useState<string | null>(null)

  async function updateRole(userId: string, role: UserRole) {
    setLoading(userId)
    const supabase = createClient()
    await supabase.from('profiles').update({ role }).eq('id', userId)
    setUsers(users.map((u) => u.id === userId ? { ...u, role } : u))
    setLoading(null)
  }

  async function toggleActive(userId: string, isActive: boolean) {
    setLoading(userId)
    const supabase = createClient()
    await supabase.from('profiles').update({ is_active: !isActive }).eq('id', userId)
    setUsers(users.map((u) => u.id === userId ? { ...u, is_active: !isActive } : u))
    setLoading(null)
  }

  async function handleUnlockRequest(requestId: string, approve: boolean) {
    setLoading(requestId)
    const supabase = createClient()
    await supabase.from('stage_unlock_requests').update({
      status: approve ? 'approved' : 'rejected',
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
    }).eq('id', requestId)
    setRequests(requests.filter((r) => r.id !== requestId))
    setLoading(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Pending unlock requests */}
      {requests.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-orange-500" />
              Pending Unlock Requests ({requests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-3 rounded-lg bg-orange-50 border border-orange-200">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {(req.requester as { full_name?: string } | null)?.full_name || 'Unknown'} wants to unlock{' '}
                    <span className="text-blue-600">{(req.product as { name?: string } | null)?.name || 'a product'}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Stage: {STAGE_LABELS[req.stage]} · {req.reason || 'No reason given'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(req.created_at)}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => handleUnlockRequest(req.id, false)}
                    disabled={loading === req.id}
                  >
                    {loading === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleUnlockRequest(req.id, true)}
                    disabled={loading === req.id}
                  >
                    {loading === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Users table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Team Members ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Joined</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-gray-200">{getInitials(user.full_name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-gray-900">{user.full_name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {user.id === adminId ? (
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[user.role]}`}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    ) : (
                      <Select
                        value={user.role}
                        onValueChange={(v) => updateRole(user.id, v as UserRole)}
                        disabled={loading === user.id}
                      >
                        <SelectTrigger className="h-8 w-[160px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABELS).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">{formatDate(user.created_at)}</td>
                  <td className="px-4 py-3.5">
                    {user.id !== adminId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(user.id, user.is_active)}
                        disabled={loading === user.id}
                        className={user.is_active ? 'text-red-600 border-red-200 hover:bg-red-50 text-xs' : 'text-green-600 border-green-200 hover:bg-green-50 text-xs'}
                      >
                        {loading === user.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
