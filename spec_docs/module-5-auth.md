# Module 5 — Authentication & User Roles

## Goal
Add Google OAuth-based authentication and a three-tier role system (admin / editor / viewer) on top of the existing app. No passwords stored anywhere — auth is delegated entirely to Google. A `users` table tracks roles and metadata.

This is a cross-cutting concern that touches Modules 1–4. It should be added **after** Module 1 is working but **before** opening the app to anyone outside yourself. Recommended order: Module 1 → Module 5 → Modules 2, 3, 4.

## Roles

| Role | Can do | Cannot do |
|---|---|---|
| **viewer** | Browse, filter, search recipes. View detail pages. Use LLM recommendations. | Add, edit, or delete recipes. Manage users. |
| **editor** | Everything viewer can, plus: create / edit / delete recipes, use LLM-assist parsing, modify tags. | Manage users (promote/demote, revoke access). |
| **admin** | Everything editor can, plus: manage all users (view list, change roles, revoke access). | Nothing within the app. |

Default role for newly authenticated users: **viewer**. Admins promote manually.

**Bootstrap admin via env var:** `INITIAL_ADMIN_EMAILS="lakshmi@example.com,you@example.com"`. The first time one of these emails completes Google OAuth, they're auto-assigned `admin`. After that, role changes happen only through the admin UI — the env var has no further effect on those accounts.

## Tech stack
- Backend: `authlib` for Google OAuth (handles discovery, PKCE, token exchange cleanly); `python-jose` for signing session JWTs; `passlib` NOT needed (no passwords).
- Session storage: signed httpOnly cookies containing a JWT. No server-side session table — stateless.
- Frontend: same React stack as Modules 2–4. Adds a `<AuthProvider>` context and route guards.

## Auth flow (Authorization Code with PKCE)

1. User clicks "Sign in with Google" on the login page.
2. Frontend calls `GET /api/v1/auth/login` — backend generates a PKCE challenge + state, stores them in a short-lived signed cookie (`oauth_state`, 10 min expiry), returns a redirect URL.
3. Frontend redirects to Google's authorization endpoint.
4. User consents on Google.
5. Google redirects to `GET /api/v1/auth/callback?code=...&state=...`.
6. Backend:
   - Validates state cookie matches the returned `state`
   - Exchanges code for tokens using the stored PKCE verifier
   - Fetches user info from Google's userinfo endpoint
   - Looks up or creates a row in `users` keyed on `google_sub` (Google's stable user ID — never use email as the primary key since users can change their email)
   - Determines role: existing user → keep their stored role; new user → check `INITIAL_ADMIN_EMAILS`, else `viewer`
   - Issues a session JWT, sets it as an httpOnly cookie
   - Redirects to the frontend home page
7. Frontend reads current user via `GET /api/v1/auth/me`.

**Logout:** `POST /api/v1/auth/logout` clears the session cookie. No need to revoke the Google token — that's overkill at this scale.

## Database

New table:

**users**
| column | type | notes |
|---|---|---|
| id | INT PK | |
| google_sub | TEXT UNIQUE NOT NULL | Google's stable user identifier ("sub" claim) |
| email | TEXT NOT NULL | from Google; may change over time |
| name | TEXT | from Google |
| picture_url | TEXT | from Google |
| role | TEXT NOT NULL | `admin` / `editor` / `viewer` |
| is_active | BOOLEAN NOT NULL DEFAULT 1 | soft-delete flag — admins can revoke access without deleting the row |
| created_at | DATETIME | default now |
| last_login_at | DATETIME | updated on each successful login |

Index on `google_sub` (already unique), `email`, and `role`.

**Audit:** add `created_by_user_id` and `updated_by_user_id` columns to the `recipes` table (nullable, FK to `users.id`, no cascade — keep history if user deleted). Populated automatically by the backend on `POST` / `PATCH` / `PUT`. This is cheap insurance for a multi-user system.

## Cookie & session config

- Cookie name: `session`
- httpOnly: true (JS can't read it)
- secure: true in production, false in local dev (env-driven)
- SameSite: Lax (allows top-level navigations from OAuth redirect, blocks cross-site CSRF for most cases)
- Max-Age: 7 days
- Signed JWT payload: `{ "sub": user.id, "role": user.role, "exp": ... }`. **Re-fetch the user from DB on every authenticated request** to pick up role changes immediately — don't trust the role claim in the JWT alone. The JWT is for identity; the DB is for authorisation.

Sign with HS256 + a 32+ byte secret stored in `SESSION_SECRET` env var. If `SESSION_SECRET` is missing, app refuses to start.

## CSRF protection

SameSite=Lax handles the common cases. For belt-and-suspenders on state-changing endpoints, implement a double-submit cookie pattern: backend sets `csrf_token` cookie (readable by JS, not httpOnly), frontend sends it back in the `X-CSRF-Token` header on all POST/PUT/PATCH/DELETE. Backend rejects mismatches.

## API endpoints

### Auth endpoints (all under `/api/v1/auth`)

```
GET    /auth/login        → returns { "redirect_url": "https://accounts.google.com/..." }
GET    /auth/callback     → handles Google redirect, sets cookie, redirects to frontend
POST   /auth/logout       → clears cookie, returns 204
GET    /auth/me           → returns current user object, or 401 if not logged in
```

`GET /auth/me` response:
```json
{
  "id": 1,
  "email": "lakshmi@example.com",
  "name": "Lakshmi",
  "picture_url": "https://lh3.googleusercontent.com/...",
  "role": "admin",
  "is_active": true
}
```

### Admin endpoints (require `role == admin`)

```
GET    /admin/users                    → list all users
PATCH  /admin/users/{id}               → update role and/or is_active. Body: { "role": "editor" } or { "is_active": false }
```

Admins cannot demote themselves below admin or deactivate themselves (return 400 with a clear message). Prevents accidentally locking everyone out.

## Authorization middleware

Implement a FastAPI dependency `require_role(min_role)` where `min_role` is one of `viewer | editor | admin`. Role hierarchy: `admin > editor > viewer`.

Apply per-endpoint:

| Endpoint(s) | Min role |
|---|---|
| `GET /auth/me` | (auth only, any role) |
| `GET /recipes`, `GET /recipes/{id}`, `GET /tags*`, `GET /aliases*`, `GET /stats` | viewer |
| `POST /recipes`, `PUT /recipes/{id}`, `PATCH /recipes/{id}`, `DELETE /recipes/{id}` | editor |
| `POST /parse-recipe` | editor |
| `POST /recommend` | viewer |
| `GET /admin/users`, `PATCH /admin/users/{id}` | admin |

Any unauthenticated request to a protected endpoint returns **401** (not 403). 403 is reserved for "authenticated but lacks permission" — frontend uses the distinction to decide whether to redirect to login or show "access denied".

Inactive users (`is_active = false`) get **403** on everything except `/auth/me` and `/auth/logout`.

## Frontend changes

### Auth context

`<AuthProvider>` wraps the app. Exposes:
- `user`: current user object or `null`
- `isLoading`: while `/auth/me` is in flight
- `signIn()`: hits `/auth/login` and redirects
- `signOut()`: hits `/auth/logout` and reloads to `/login`

### Route guards

- `<RequireAuth>` — redirects to `/login` if `user == null`
- `<RequireRole role="editor">` — shows "Access denied" page if user role is below required

Wrap routes accordingly. The login page itself is public.

### Login page (`/login`)

Minimal: app title, brief description, "Sign in with Google" button. Standard Google-branded button (white background, Google logo, "Sign in with Google" text — follow Google's branding guidelines so the button looks legit).

### Header changes (visible on all pages once logged in)

Top-right of the app shell:
- User avatar (from `picture_url`) + name
- Click → dropdown with: "Admin → User management" (admin only), "Sign out"

### Hiding admin/editor features for viewers

- Recipe detail page: "Edit" button only shown if `user.role` is editor or admin
- Main nav: "Add Recipe" link only for editor/admin
- Filter sidebar / browse: no change — viewers see everything

When a viewer somehow ends up on `/recipe/{id}/edit` or `/recipe/new`, the `<RequireRole role="editor">` guard catches it.

### Admin user management page (`/admin/users`)

A simple table:

| Avatar | Name | Email | Role (editable dropdown) | Active (toggle) | Last login | Created |
|---|---|---|---|---|---|---|

Changes save inline on dropdown/toggle change. Confirmation dialog for deactivation and for demoting from admin.

Admin cannot demote themselves or deactivate themselves — those controls are disabled with a tooltip explaining why.

## Integration with existing modules

### Module 1 (Backend)
- Add `users` table + migration
- Add `created_by_user_id` / `updated_by_user_id` to `recipes` table (nullable, populated on writes)
- Add all `/auth/*` and `/admin/*` endpoints
- Add `require_role` dependency, apply to existing endpoints per the table above
- Add `oauth_state` short-lived signed cookie helper
- Update CORS config: `allow_credentials=True` (required for cookies); `allow_origins` must be an explicit list, not `*`

### Module 2 (Browse UI)
- Wrap router with `<AuthProvider>` and `<RequireAuth>`
- Add header user menu
- Add login page route

### Module 3 (CRUD UI)
- Hide Add/Edit/Delete buttons for viewers
- Wrap `/recipe/new`, `/recipe/{id}/edit` with `<RequireRole role="editor">`
- All write requests automatically include the session cookie (via fetch `credentials: 'include'`) — make sure the API client is configured for this

### Module 4 (LLM)
- Wrap `/recommend` with `<RequireAuth>` — all authenticated users can use it
- Consider rate-limiting per user (e.g. 100 recommendation requests/day) — not required for MVP, mention it as a future hardening step

## Environment variables

```
GOOGLE_OAUTH_CLIENT_ID=<from Google Cloud Console>
GOOGLE_OAUTH_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/api/v1/auth/callback   # update for prod

SESSION_SECRET=<32+ byte random string>
SESSION_COOKIE_SECURE=false                                            # true in prod
SESSION_COOKIE_DOMAIN=                                                 # empty for dev, ".yourdomain.com" for prod

FRONTEND_URL=http://localhost:5173                                     # where to redirect after OAuth
INITIAL_ADMIN_EMAILS=lakshmi@example.com,you@example.com

ALLOWED_ORIGINS=http://localhost:5173                                  # CORS — comma-separated
```

App startup must validate all required env vars are present and non-empty. Fail fast with a clear message.

## Google Cloud Console setup (one-time, document in README)

1. Create a project at https://console.cloud.google.com
2. Enable "Google+ API" / "People API" (whichever is required for userinfo at the time)
3. Configure OAuth consent screen — set scopes to `openid email profile`
4. Create OAuth 2.0 Client ID, application type "Web application"
5. Add authorized redirect URIs: `http://localhost:8000/api/v1/auth/callback` (and prod URL when ready)
6. Copy client ID + secret into `.env`

## Project structure additions

```
backend/app/
  auth/
    __init__.py
    oauth.py              # Google OAuth helpers (authlib client setup)
    session.py            # JWT signing/verifying, cookie helpers
    deps.py               # require_role, get_current_user dependencies
    csrf.py               # double-submit cookie helpers
  routers/
    auth.py               # /auth/* endpoints
    admin.py              # /admin/* endpoints
  models.py               # add User model + audit columns

frontend/src/
  auth/
    AuthProvider.tsx
    RequireAuth.tsx
    RequireRole.tsx
    useAuth.ts
  pages/
    LoginPage.tsx
    AdminUsersPage.tsx
    AccessDeniedPage.tsx
  components/
    UserMenu.tsx
```

## Acceptance criteria

- New user can sign in with Google end-to-end and lands on home page as `viewer`
- An email in `INITIAL_ADMIN_EMAILS` signing in for the first time gets `admin` role automatically
- A viewer cannot access `/recipe/new` — they see "Access denied" page
- A viewer's UI doesn't show Edit/Delete buttons on recipe pages
- An admin can promote a user from viewer → editor in the admin UI and that user's next page load reflects the new permissions
- An admin cannot demote themselves or deactivate themselves
- Deactivating a user revokes access immediately on their next request (403)
- Logout clears the cookie and unauthenticated requests to protected endpoints return 401
- The session cookie is `httpOnly`, `SameSite=Lax`, and `secure` in production
- A POST/PATCH/PUT/DELETE without the CSRF token header is rejected with 403
- A direct API request to `POST /recipes` without a session cookie returns 401, not 200

## Out of scope (deferred / explicitly not in this module)

- Email/password login (Google-only is the policy)
- Other OAuth providers (Microsoft, Apple, GitHub) — easy to add later via authlib
- Two-factor auth (Google handles this on their end)
- Granular per-recipe permissions ("Lakshmi can edit only her own recipes") — current scope is global RBAC
- Audit log endpoint surfacing edits to admins (the `updated_by_user_id` column captures this in the DB but no UI for it yet)
- Session revocation across devices (would require a server-side session store)
- Self-service signup gating (e.g. invite codes, email allowlist) — current model is "anyone with a Google account can sign in as a viewer; admins promote from there"

## Security checklist before deploying outside localhost

- `SESSION_COOKIE_SECURE=true`
- `SESSION_SECRET` is 32+ random bytes from a CSPRNG, not a memorable string
- HTTPS termination (Caddy / nginx / Cloudflare — pick one)
- `ALLOWED_ORIGINS` is the exact production origin, not a wildcard
- `GOOGLE_OAUTH_REDIRECT_URI` matches what's registered in Google Cloud Console exactly
- Rate-limit `/auth/callback` to prevent abuse (10 req/min/IP is plenty)
- Backend logs include user_id on authenticated requests for traceability
