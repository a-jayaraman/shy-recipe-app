import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, UserCircle2, Settings, LogOut } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/auth/useAuth'

export function UserMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (!user) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-accent transition-colors text-sm"
          aria-label="User menu"
        >
          {user.picture_url ? (
            <img
              src={user.picture_url}
              alt={user.name ?? user.email}
              className="size-7 rounded-full flex-shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <UserCircle2 className="size-7 text-muted-foreground flex-shrink-0" />
          )}
          <span className="hidden sm:block max-w-32 truncate font-medium text-foreground">
            {user.name ?? user.email}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        <div className="px-3 py-2">
          <p className="text-sm font-medium truncate">{user.name ?? user.email}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          <p className="text-xs text-muted-foreground capitalize mt-0.5">{user.role}</p>
        </div>
        <Separator className="my-1" />
        {user.role === 'admin' && (
          <button
            onClick={() => { navigate('/admin/users'); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent transition-colors text-left"
          >
            <Settings className="size-4 text-muted-foreground" />
            User management
          </button>
        )}
        <button
          onClick={() => { signOut(); setOpen(false) }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent transition-colors text-left text-destructive"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </PopoverContent>
    </Popover>
  )
}
