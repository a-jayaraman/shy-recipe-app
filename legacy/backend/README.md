# Recipe App — Backend

FastAPI + SQLModel + SQLite backend for the Shy Blog recipe collection.

## Setup

```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate       # Linux/Mac
# .venv\Scripts\activate        # Windows

# Install dependencies (using uv for speed)
pip install uv
uv pip install -r requirements.txt --python .venv/bin/python
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | Google OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | Google OAuth 2.0 client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | `http://localhost:8000/api/v1/auth/callback` in dev |
| `SESSION_SECRET` | Yes | Random hex string for signing JWT session cookies |
| `FRONTEND_URL` | Yes | `http://localhost:5173` in dev |
| `OPENROUTER_API_KEY` | Yes | OpenRouter key for LLM recommendations |
| `INITIAL_ADMIN_EMAILS` | No | Comma-separated emails auto-promoted to admin on first login |
| `DATABASE_URL` | No | SQLite path (default: `sqlite:///./recipes.db`) |
| `ALLOWED_ORIGINS` | No | CORS origins (default: `http://localhost:5173,http://localhost:3000`) |
| `SESSION_COOKIE_SECURE` | No | Set `true` in production (HTTPS only) |

The server refuses to start if any required variable is missing.

## Seed the Database

```bash
cd backend/
python scripts/import_recipes.py
```

Data files (`recipes_standardized.json`, `entry_mapping.json`) are read from the project root (one level up). Use `--data-dir PATH` to override.

Re-running is safe — the script deletes and reseeds by default. Use `--upsert` for non-destructive updates.

## Run the Server

```bash
cd backend/
PYTHONPATH=. .venv/bin/uvicorn app.main:app --reload
```

Server starts at `http://localhost:8000`. OpenAPI docs at `http://localhost:8000/docs`.

## Run Tests

```bash
cd backend/
pytest tests/ -v
```

58 tests covering recipes, filters, tags, parsing, and recommendations.

## API Overview

Base prefix: `/api/v1`

### Recipes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/recipes` | Public | List + filter recipes |
| GET | `/recipes/{id}` | Public | Full recipe detail |
| POST | `/recipes` | Editor+ | Create recipe |
| PUT | `/recipes/{id}` | Editor+ | Full replace |
| PATCH | `/recipes/{id}` | Editor+ | Partial update |
| DELETE | `/recipes/{id}` | Editor+ | Delete recipe |

### Tags, Aliases & Stats

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tags` | Public | All tag categories |
| GET | `/tags/{category}` | Public | Values + counts for one category |
| GET | `/aliases/ingredients` | Public | Full ingredient alias map |
| GET | `/aliases/tags` | Public | Tag slug → display name map |
| GET | `/stats` | Public | Import stats and counts |

### LLM Recommendations

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/recommend` | Viewer+ | SSE stream — LLM recipe recommendations |
| GET | `/recommend/validate-model` | Viewer+ | Validate an OpenRouter model ID |

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/login` | Public | Returns Google OAuth redirect URL |
| GET | `/auth/callback` | Public | OAuth callback; sets session + CSRF cookies |
| POST | `/auth/logout` | Any | Clears session and CSRF cookies |
| GET | `/auth/me` | Viewer+ | Returns current user info |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/users` | Admin | List all users |
| PATCH | `/admin/users/{id}` | Admin | Update user role or active status |

## Filter Params for `GET /recipes`

- `q` — free text (title or ingredient name)
- `cuisine`, `cooking_method`, `serve_with`, `dietary` — repeatable, OR within field
- `key_ingredient` — repeatable, AND semantics (recipe must have all)
- `has_ingredient` — repeatable, AND semantics, LIKE match on actual ingredients
- `course`, `difficulty`, `total_time` — single value enum filters
- `sort` — `title` (default) | `recent` | `random`
- `limit` — default 50, max 200
- `offset` — default 0

Ingredient alias resolution is applied automatically to `key_ingredient` and `has_ingredient` (e.g. `capsicum` → `bell pepper`, `hing` → `asafoetida`).

## Auth & Security Details

- **Google OAuth 2.0 with PKCE** — state and code verifier stored in a short-lived signed cookie to prevent CSRF on the OAuth flow.
- **JWT session cookie** — `HttpOnly`, `SameSite=Lax`; set `SESSION_COOKIE_SECURE=true` in production.
- **CSRF protection** — double-submit pattern: a `csrf_token` cookie paired with an `X-CSRF-Token` request header is required on all state-changing endpoints.
- **Roles** — `viewer` (read + recommend), `editor` (+ write recipes), `admin` (+ user management). First-login emails in `INITIAL_ADMIN_EMAILS` are auto-promoted.

## Reset the Database

```bash
rm recipes.db
python scripts/import_recipes.py
```
