# Migration Spec: FastAPI/Render → Supabase + GitHub Pages

## Overview

Migrate the Shy Recipe App from a FastAPI + SQLite + Render deployment to a fully static frontend on GitHub Pages backed by Supabase (Postgres + Auth + Edge Functions). Eliminate the FastAPI backend entirely.

**Branch:** Create a new branch named `migration/supabase` and do all work there. Do not merge to `main` until acceptance criteria pass.

## Goals

- Zero-cost hosting ($0/month)
- No always-on server, no cold starts to worry about
- Persistent cloud database (no data loss on restarts)
- Static frontend hosted on GitHub Pages
- Preserve all existing functionality: browse/search/filter, CRUD, Google OAuth, role-based access (viewer/editor/admin), AI recommendations, admin user management

## Architecture: Before vs After

### Before
```
React (Vite) → FastAPI (Render) → SQLite (ephemeral disk)
                  ↓
              Authlib + python-jose (Google OAuth, JWT cookies)
                  ↓
              OpenRouter (server-side call)
```

### After
```
React (GitHub Pages) → Supabase (Postgres + PostgREST API)
                          ↓
                     Supabase Auth (Google OAuth, JWT in client)
                          ↓
                     Supabase Edge Function (proxies OpenRouter)
```

## Phase 1: Supabase Project Setup

### 1.1 Create the project
1. Create a new Supabase project at supabase.com (free tier).
2. Region: closest to user (US East).
3. Record `SUPABASE_URL` and `SUPABASE_ANON_KEY` from project settings.

### 1.2 Database schema

Translate the existing SQLModel schema in `backend/app/models/` to Supabase migrations. Place all migration SQL in `supabase/migrations/`.

Tables to create (mirror existing structure; do not redesign):
- `recipes` — primary table with all recipe fields
- `tags` — tag dictionary
- `recipe_tags` — many-to-many join
- `aliases` — ingredient alias lookup (from `entry_mapping.json`)
- `profiles` — extends `auth.users` with role field

The `profiles` table is new. Schema:
```sql
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role text not null default 'viewer' check (role in ('viewer', 'editor', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz default now()
);
```

Create a trigger that automatically inserts a `profiles` row on `auth.users` insert, defaulting to `viewer`. Bootstrap initial admins by reading `INITIAL_ADMIN_EMAILS` env var during seeding — write a one-time SQL script that promotes those emails to admin after first signup.

### 1.3 Row Level Security (RLS) policies

Enable RLS on all tables. Policies needed:

**`recipes`, `tags`, `recipe_tags`, `aliases`:**
- `SELECT`: public (anyone, no auth required) — matches current public browse behavior
- `INSERT`, `UPDATE`, `DELETE`: only users whose `profiles.role` is `editor` or `admin` AND `is_active = true`

**`profiles`:**
- `SELECT`: users can read their own row; admins can read all rows
- `UPDATE`: admins only (for role/active management)
- No client-side `INSERT` (handled by trigger) or `DELETE`

Write these as proper Postgres RLS policies in migration SQL. Use a helper function:
```sql
create or replace function public.is_editor()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('editor', 'admin')
      and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;
```

### 1.4 Auth configuration

In the Supabase dashboard:
1. Enable Google OAuth provider. Reuse the existing `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
2. Add redirect URL: `https://<github-username>.github.io/shy-recipe-app/auth/callback` (and `http://localhost:5173/auth/callback` for dev).
3. Update the Google Cloud OAuth client to add Supabase's callback URL (`https://<project>.supabase.co/auth/v1/callback`) as an authorized redirect URI.
4. Set Site URL to the GitHub Pages URL.

## Phase 2: Data Migration

### 2.1 Export SQLite data

Write a one-off Python script `scripts/migrate_sqlite_to_supabase.py` that:
1. Reads `backend/recipes.db` (already in the repo)
2. Connects to Supabase Postgres using the service role key (CLI-only, never committed)
3. Inserts all recipes, tags, recipe_tags, and aliases preserving primary keys where possible

Alternative if cleaner: dump SQLite to JSON, use the existing `recipes_standardized.json` + `entry_mapping.json` as the source of truth, write a Node/TS script that uses the Supabase JS client to seed.

Pick whichever is simpler. Document the choice.

### 2.2 Verify migration

After seeding, run sanity queries:
- `SELECT count(*) FROM recipes` matches SQLite count
- A spot-check on 3-5 recipes confirms all fields present (ingredients, steps, tags)
- Alias lookup works: search for `capsicum` resolves to recipes tagged `bell pepper`

## Phase 3: Frontend Refactor

### 3.1 Install Supabase client

```bash
cd frontend
npm install @supabase/supabase-js
```

### 3.2 Create the Supabase client module

`frontend/src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `frontend/.env.example`.

### 3.3 Replace the API layer

Find every place in the frontend that currently calls `fetch('/api/v1/...')` or uses any axios/api client. Replace with Supabase queries.

Examples:
```ts
// Before
const res = await fetch(`${API_BASE}/api/v1/recipes`);
const data = await res.json();

// After
const { data, error } = await supabase
  .from('recipes')
  .select('*, tags(*)')
  .order('created_at', { ascending: false });
```

Keep TanStack Query — wrap Supabase calls in `useQuery` / `useMutation` hooks. Create a new directory `frontend/src/queries/` with one file per entity (`recipes.ts`, `tags.ts`, `profiles.ts`, `recommend.ts`).

For complex filters (cuisine, dietary, cooking method, free-text search, alias resolution): use Supabase's filter chaining (`.eq()`, `.ilike()`, `.in()`, `.or()`). For alias resolution specifically, this likely needs to remain server-side logic — implement as a Postgres function (RPC) callable via `supabase.rpc('search_recipes', { query: '...' })`.

### 3.4 Replace auth flow

Replace the entire Authlib/JWT cookie flow with Supabase Auth.

Login button:
```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/auth/callback` }
});
```

Add `/auth/callback` route that handles the redirect — Supabase JS client auto-exchanges the code for a session. Then redirect to `/`.

Create `useAuth()` hook:
```ts
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}
```

Create `useProfile()` hook that fetches the current user's `profiles` row (including `role`). Use this for all role-based UI gating (showing edit buttons, admin panel link, etc.).

Replace existing `PrivateRoute` / role-checking route guards with versions that consume `useProfile()`.

### 3.5 Remove CSRF code

CSRF double-submit cookies are not needed — Supabase uses bearer tokens (JWT in Authorization header), not cookies. Strip all CSRF middleware/headers from frontend.

### 3.6 Router config for GitHub Pages

GitHub Pages serves at `/<repo-name>/`, not root. Two changes:

1. In `frontend/vite.config.ts`, set `base: '/shy-recipe-app/'` for production builds.
2. In React Router config, set `basename="/shy-recipe-app"` on the `BrowserRouter`.
3. Handle SPA routing: copy `index.html` to `404.html` at build time so deep links work. Add a script to `package.json`:
```json
"build": "vite build && cp dist/index.html dist/404.html"
```

## Phase 4: Edge Function for AI Recommendations

### 4.1 Create the function

```
supabase/functions/recommend/index.ts
```

The function:
1. Verifies the request has a valid Supabase JWT (auth check)
2. Optionally verifies the user has `role` of `viewer`/`editor`/`admin` via a query
3. Forwards the chat payload to OpenRouter using `Deno.env.get('OPENROUTER_API_KEY')`
4. Returns the streamed response

The function must also support OpenRouter's tool-use flow — it needs to expose a "search recipes" tool to the LLM and call back into the Supabase REST API or RPC to execute searches. Reuse the existing tool-call schema from `backend/app/services/recommend.py`.

Set the secret:
```bash
supabase secrets set OPENROUTER_API_KEY=<key>
```

Local dev: place a `.env` at `supabase/functions/.env` with the same key. Do not commit this file — add to `.gitignore`.

### 4.2 Frontend integration

```ts
const { data, error } = await supabase.functions.invoke('recommend', {
  body: { messages: [...] }
});
```

Wrap in a `useRecommendMutation` hook.

## Phase 5: GitHub Pages Deployment

### 5.1 GitHub Actions workflow

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy frontend to GitHub Pages
on:
  push:
    branches: [main]
    paths: ['frontend/**', '.github/workflows/deploy.yml']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: frontend
      - run: npm run build
        working-directory: frontend
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: frontend/dist
      - uses: actions/deploy-pages@v4
        id: deployment
```

### 5.2 Repo settings

1. Settings → Pages → Source: "GitHub Actions"
2. Settings → Secrets and variables → Actions → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

These keys are fine in client builds — the anon key is meant to be public; RLS is what protects the data.

## Phase 6: Cleanup

After acceptance criteria pass and the new deployment is verified:

1. Move `backend/` to `legacy/backend/` (don't delete — keep for reference for a few weeks).
2. Delete `render-build.sh`, `render-start.sh`, `start.sh`.
3. Rewrite `README.md` to reflect the new architecture.
4. Update `spec_docs/` with a brief "Architecture" doc describing the new stack.

## Acceptance Criteria

Migration is done when all of the following are true on the `migration/supabase` branch:

- [ ] Public browse page loads recipes from Supabase with no FastAPI backend running
- [ ] All filters (cuisine, dietary, method, ingredient, free-text) work
- [ ] Ingredient alias resolution still works (capsicum → bell pepper)
- [ ] Google OAuth login works end-to-end via Supabase Auth
- [ ] Editor users can create/edit/delete recipes; viewers cannot (verified by attempting and getting RLS rejection)
- [ ] Admin panel can view all users and change roles
- [ ] AI recommendations chat works via Edge Function (verified the OpenRouter key is not in the client bundle — check `dist/` for the key string)
- [ ] GitHub Action deploys frontend to `https://<user>.github.io/shy-recipe-app/` on push
- [ ] Deep links work (e.g. `/recipe/42` loads correctly from a fresh visit, not just SPA navigation)
- [ ] Render service is no longer required to be running for the app to work

## Open Questions / Decisions Needed

These should be resolved before or during implementation — flag them if Claude Code hits one:

1. **Alias resolution implementation**: Postgres function vs. client-side join with `aliases` table. Pick based on complexity of current Python logic.
2. **Tool-use loop for AI**: does the Edge Function execute the tool calls and return final answer, or stream tool calls to the client which then re-invokes the function? Server-side loop is simpler.
3. **Existing user data**: if any users have logged in via the current system, do their roles need to be ported? If yes, write a separate migration that matches by email and inserts into `profiles`.
4. **Session secret / JWT**: Supabase manages this internally — no need to migrate `SESSION_SECRET`.

## Implementation Order

Suggested order of execution. Do not skip ahead — each phase should be working before moving on:

1. Phase 1.1, 1.2, 1.3 — schema and RLS in Supabase
2. Phase 2 — data migration; verify in Supabase dashboard
3. Phase 1.4 — auth configuration (only after schema exists)
4. Phase 3.1, 3.2, 3.3 — frontend client + non-auth queries. Test browse/search works.
5. Phase 3.4, 3.5 — auth migration. Test login + RLS-gated writes.
6. Phase 3.6 — router config for subpath
7. Phase 4 — Edge Function. Test AI recommendations.
8. Phase 5 — GitHub Pages deployment
9. Phase 6 — cleanup

Commit at the end of each phase. Use conventional commits: `feat(supabase): ...`, `refactor(frontend): ...`, etc.
