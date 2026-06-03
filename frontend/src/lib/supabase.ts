import { createClient } from '@supabase/supabase-js'

// Without a timeout, a stalled token-refresh or unreachable project causes
// every write (insert/update/delete) to hang indefinitely — the fetch never
// rejects, mutateAsync never settles, and the "Saving…" spinner never clears.
const TIMEOUT_MS = 15_000

function fetchWithTimeout(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id))
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  {
    global: { fetch: fetchWithTimeout },
    auth: {
      // navigator.locks deadlocks in Firefox when concurrent auth.getSession() calls
      // happen (one from AuthProvider, one from _getAccessToken() before each RPC).
      // Bypassing the lock is safe for a single-tab personal app.
      lock: async (_name, _acquireTimeout, fn) => fn(),
    },
  },
)
