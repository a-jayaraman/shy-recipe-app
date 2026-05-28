import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  {
    auth: {
      // navigator.locks deadlocks in Firefox when concurrent auth.getSession() calls
      // happen (one from AuthProvider, one from _getAccessToken() before each RPC).
      // Bypassing the lock is safe for a single-tab personal app.
      lock: async (_name, _acquireTimeout, fn) => fn(),
    },
  },
)
