import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

# session.py raises RuntimeError at import time if SESSION_SECRET is missing
from app.auth import session as _session_module  # noqa: F401 — triggers startup validation

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth.csrf import require_csrf
from app.db import create_db_and_tables
from app.routers import recipes, tags, stats, aliases, parse, recommend
from app.routers import auth as auth_router
from app.routers import admin as admin_router


_REQUIRED_ENV_VARS = [
    "SESSION_SECRET",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI",
    "FRONTEND_URL",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = [v for v in _REQUIRED_ENV_VARS if not os.environ.get(v)]
    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}"
        )
    create_db_and_tables()
    yield


app = FastAPI(
    title="Recipe API",
    version="1.0.0",
    description="REST API for the Shy Blog recipe collection.",
    lifespan=lifespan,
)

_raw_origins = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
)
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"

# Public / read-only routers — no CSRF needed
app.include_router(tags.router, prefix=PREFIX)
app.include_router(stats.router, prefix=PREFIX)
app.include_router(aliases.router, prefix=PREFIX)

# Auth router — /logout is POST but we skip CSRF there (it's safe; clearing state is idempotent)
app.include_router(auth_router.router, prefix=PREFIX)

# Mutating routers — require CSRF on all state-changing requests
_csrf = [Depends(require_csrf)]
app.include_router(recipes.router, prefix=PREFIX, dependencies=_csrf)
app.include_router(parse.router, prefix=PREFIX, dependencies=_csrf)
app.include_router(recommend.router, prefix=PREFIX, dependencies=_csrf)
app.include_router(admin_router.router, prefix=PREFIX, dependencies=_csrf)

# Serve built React frontend — must be mounted last so API routes take priority
_frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
