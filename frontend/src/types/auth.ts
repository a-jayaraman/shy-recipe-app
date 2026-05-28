export interface CurrentUser {
  id: string            // UUID from Supabase Auth (was int in FastAPI)
  email: string
  name: string | null
  picture_url: string | null
  role: 'viewer' | 'editor' | 'admin'
  is_active: boolean
  created_at?: string | null
  last_login_at?: string | null
}

export const ROLE_HIERARCHY: Record<CurrentUser['role'], number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
} as const

export function hasRole(user: CurrentUser, min: CurrentUser['role']): boolean {
  return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[min]
}
