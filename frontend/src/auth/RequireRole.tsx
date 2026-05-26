import { type ReactNode } from 'react'
import { useAuth } from './useAuth'
import { hasRole } from '@/types/auth'
import { AccessDeniedPage } from '@/pages/AccessDeniedPage'

interface Props {
  role: 'editor' | 'admin'
  children: ReactNode
}

export function RequireRole({ role, children }: Props) {
  const { user } = useAuth()

  if (!user || !hasRole(user, role)) {
    return <AccessDeniedPage />
  }

  return <>{children}</>
}
