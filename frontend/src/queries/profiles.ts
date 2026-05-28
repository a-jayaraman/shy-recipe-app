import { supabase } from '@/lib/supabase'
import type { CurrentUser } from '../types/auth'

type ProfileRow = {
  id: string
  email: string
  role: string
  is_active: boolean
  created_at: string | null
  last_login_at: string | null
}

function rowToUser(r: ProfileRow): CurrentUser {
  return {
    id: r.id,
    email: r.email,
    name: null,
    picture_url: null,
    role: r.role as CurrentUser['role'],
    is_active: r.is_active,
    created_at: r.created_at,
    last_login_at: r.last_login_at,
  }
}

export async function fetchProfile(userId: string): Promise<CurrentUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, is_active, created_at, last_login_at')
    .eq('id', userId)
    .single()

  if (error) return null
  return rowToUser(data as ProfileRow)
}

export async function fetchAllProfiles(): Promise<CurrentUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, is_active, created_at, last_login_at')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map(r => rowToUser(r as ProfileRow))
}

export async function updateProfile(
  id: string,
  patch: { role?: string; is_active?: boolean },
): Promise<CurrentUser> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', id)
    .select('id, email, role, is_active, created_at, last_login_at')
    .single()

  if (error) throw new Error(error.message)
  return rowToUser(data as ProfileRow)
}
