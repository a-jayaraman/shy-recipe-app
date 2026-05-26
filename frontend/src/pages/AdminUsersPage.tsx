import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { apiClient } from '@/api/client'
import type { CurrentUser } from '@/types/auth'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UserCircle2 } from 'lucide-react'

function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiClient.get<CurrentUser[]>('/admin/users').then((r) => r.data),
  })
}

function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { role?: string; is_active?: boolean } }) =>
      apiClient.patch<CurrentUser>(`/admin/users/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to update user')
    },
  })
}

type ConfirmAction =
  | { type: 'deactivate'; user: CurrentUser }
  | { type: 'demote'; user: CurrentUser; newRole: string }

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function AdminUsersPage() {
  const { user: self } = useAuth()
  const { data: users, isLoading } = useAdminUsers()
  const updateUser = useUpdateUser()
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)

  const handleRoleChange = (target: CurrentUser, newRole: string) => {
    if (target.role === 'admin' && newRole !== 'admin') {
      setConfirm({ type: 'demote', user: target, newRole })
    } else {
      updateUser.mutate({ id: target.id, data: { role: newRole } })
    }
  }

  const handleActiveChange = (target: CurrentUser, active: boolean) => {
    if (!active) {
      setConfirm({ type: 'deactivate', user: target })
    } else {
      updateUser.mutate({ id: target.id, data: { is_active: true } })
    }
  }

  const confirmAction = () => {
    if (!confirm) return
    if (confirm.type === 'deactivate') {
      updateUser.mutate({ id: confirm.user.id, data: { is_active: false } })
    } else {
      updateUser.mutate({ id: confirm.user.id, data: { role: confirm.newRole } })
    }
    setConfirm(null)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">User management</h1>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-36">Role</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground w-20">Active</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last login</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(users ?? []).map((u) => {
                const isSelf = u.id === self?.id
                return (
                  <tr key={u.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {u.picture_url ? (
                          <img
                            src={u.picture_url}
                            alt={u.name ?? ''}
                            className="size-7 rounded-full flex-shrink-0"
                          />
                        ) : (
                          <UserCircle2 className="size-7 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="font-medium">{u.name ?? '—'}</span>
                        {isSelf && (
                          <span className="text-xs text-muted-foreground">(you)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={u.role}
                        onValueChange={(v) => handleRoleChange(u, v)}
                        disabled={isSelf}
                      >
                        <SelectTrigger
                          className="h-8 w-28 text-xs"
                          title={isSelf ? 'Cannot change your own role' : undefined}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Checkbox
                        checked={u.is_active}
                        onCheckedChange={(v) => handleActiveChange(u, v === true)}
                        disabled={isSelf}
                        title={isSelf ? 'Cannot deactivate yourself' : undefined}
                        aria-label="Active"
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(u.last_login_at)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(u.created_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.type === 'deactivate' ? 'Deactivate user?' : 'Change role?'}
            </DialogTitle>
            <DialogDescription>
              {confirm?.type === 'deactivate'
                ? `${confirm.user.name ?? confirm.user.email} will lose access immediately.`
                : `Change ${confirm?.user.name ?? confirm?.user.email}'s role from admin to ${confirm?.newRole}. They will lose admin privileges immediately.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmAction}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
