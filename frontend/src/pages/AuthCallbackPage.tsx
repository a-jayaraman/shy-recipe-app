import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase JS automatically exchanges the OAuth code in the URL fragment/params
    // for a session. We just need to wait for the session to be established.
    supabase.auth.getSession().then(() => {
      navigate('/', { replace: true })
    })
  }, [navigate])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Signing in…</p>
    </div>
  )
}
