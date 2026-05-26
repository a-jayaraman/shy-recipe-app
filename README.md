# Shy Blog Recipe App

A full-stack recipe management application with AI-powered recommendations. Browse, search, and filter a personal recipe collection, create and edit recipes, and ask an LLM to suggest what to cook.

## Features

- **Browse & search** — filter by cuisine, dietary preference, cooking method, key ingredient, free-text search, and more
- **Recipe detail** — full ingredient list, step-by-step instructions, cooking mode (fullscreen overlay)
- **CRUD editor** — create, edit, and delete recipes (editor role required)
- **AI recommendations** — chat with an LLM via OpenRouter that calls your recipe API to find relevant dishes
- **Google OAuth** — sign in with Google; role-based access control (viewer / editor / admin)
- **Admin panel** — manage user roles and active status

## Architecture

```
recipe-app/
├── backend/        # FastAPI + SQLModel + SQLite REST API (port 8000)
├── frontend/       # React 19 + TypeScript + Vite + Tailwind + shadcn/ui (port 5173)
├── start.sh        # Starts both servers together
├── recipes_standardized.json   # Recipe data seed file
└── entry_mapping.json          # Tag/alias lookup tables
```

## Prerequisites

- Python 3.11+
- Node.js 20+
- A Google Cloud OAuth 2.0 Client ID (for authentication)
- An OpenRouter API key (for AI recommendations)

## Quick Start

```bash
# 1. Set up the backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install uv && uv pip install -r requirements.txt --python .venv/bin/python
cp .env.example .env        # then fill in credentials (see Environment Variables below)

# 2. Seed the database
python scripts/import_recipes.py

# 3. Set up the frontend
cd ../frontend
npm install

# 4. Start everything
cd ..
./start.sh
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Manual Start

```bash
# Backend
cd backend
PYTHONPATH=. .venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm run dev
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | Google OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | Google OAuth 2.0 client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | Must be `http://localhost:8000/api/v1/auth/callback` in dev |
| `SESSION_SECRET` | Yes | Random hex string for signing JWT session cookies |
| `FRONTEND_URL` | Yes | `http://localhost:5173` in dev |
| `INITIAL_ADMIN_EMAILS` | No | Comma-separated emails granted admin on first login |
| `OPENROUTER_API_KEY` | Yes | OpenRouter key for LLM recommendations |
| `DATABASE_URL` | No | SQLite path (default: `sqlite:///./recipes.db`) |
| `ALLOWED_ORIGINS` | No | CORS origins (default: `http://localhost:5173,http://localhost:3000`) |
| `SESSION_COOKIE_SECURE` | No | Set `true` in production (HTTPS only) |

### Google Cloud Console Setup

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Create an OAuth 2.0 Client ID (Web application type)
3. Add authorized redirect URI: `http://localhost:8000/api/v1/auth/callback`
4. Copy the client ID and secret into `backend/.env`

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend base URL |

## Pages

| Path | Access | Description |
|---|---|---|
| `/` | Public | Recipe list with search and filters |
| `/recipe/:id` | Public | Recipe detail with cooking mode |
| `/recipe/new` | Editor+ | Create a new recipe |
| `/recipe/:id/edit` | Editor+ | Edit an existing recipe |
| `/recommend` | Viewer+ | AI recommendation chat |
| `/admin/users` | Admin | User management |
| `/login` | Public | Google sign-in |

## Tech Stack

### Backend
- [FastAPI](https://fastapi.tiangolo.com) — async REST framework
- [SQLModel](https://sqlmodel.tiangolo.com) — ORM wrapping SQLAlchemy + Pydantic
- SQLite — database
- [Authlib](https://docs.authlib.org) + [python-jose](https://github.com/mpdavis/python-jose) — OAuth 2.0 + JWT
- [OpenRouter](https://openrouter.ai) — LLM API gateway for AI recommendations

### Frontend
- [React 19](https://react.dev) + TypeScript
- [Vite](https://vite.dev) — build tool and dev server
- [Tailwind CSS v3](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) — component library
- [TanStack Query](https://tanstack.com/query) — data fetching and caching
- [React Router v7](https://reactrouter.com) — client-side routing
- [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev) — form validation
- [Sonner](https://sonner.emilkowal.ski) — toast notifications

## Development Notes

- The backend refuses to start if any required environment variables are missing.
- Public endpoints (browse, tags, stats, aliases) require no authentication. Write operations and `/recommend` require a logged-in session.
- CSRF double-submit protection is applied to all state-changing requests.
- Ingredient alias resolution is automatic: searching for `capsicum` finds recipes with `bell pepper`.
- All filter state on the browse page lives in the URL (`useSearchParams`), so searches are shareable and browser-navigable.

## Running Tests

```bash
cd backend
pytest tests/ -v
```

58 tests covering recipes, filters, tags, parsing, and recommendations.
