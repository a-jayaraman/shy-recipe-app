import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import create_db_and_tables
from app.routers import recipes, tags, stats, aliases, parse, recommend


@asynccontextmanager
async def lifespan(app: FastAPI):
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
app.include_router(recipes.router, prefix=PREFIX)
app.include_router(tags.router, prefix=PREFIX)
app.include_router(stats.router, prefix=PREFIX)
app.include_router(aliases.router, prefix=PREFIX)
app.include_router(parse.router, prefix=PREFIX)
app.include_router(recommend.router, prefix=PREFIX)
