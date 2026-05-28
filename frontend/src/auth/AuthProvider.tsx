import { createContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { fetchProfile } from '@/queries/profiles'
import type { CurrentUser } from '@/types/auth'

interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

async function sessionToUser(session: Session | null): Promise<CurrentUser | null> {
  if (!session) return null

  const supabaseUser = session.user
  const profile = await fetchProfile(supabaseUser.id)

  // Profile may not exist yet if the trigger hasn't fired (edge case on first load)
  const role = profile?.role ?? 'viewer'
  const isActive = profile?.is_active ?? true

  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    name: supabaseUser.user_metadata?.full_name ?? supabaseUser.user_metadata?.name ?? null,
    picture_url: supabaseUser.user_metadata?.avatar_url ?? supabaseUser.user_metadata?.picture ?? null,
    role: role as CurrentUser['role'],
    is_active: isActive,
    created_at: profile?.created_at ?? supabaseUser.created_at ?? null,
    last_login_at: profile?.last_login_at ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Hydrate from existing session on mount
    supabase.auth.getSession().then(async ({ data }) => {
      setUser(await sessionToUser(data.session))
      setIsLoading(false)
    })

    // Subscribe to auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      setUser(await sessionToUser(session))
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
