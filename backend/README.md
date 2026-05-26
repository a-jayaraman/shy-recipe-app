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

## Seed the database

```bash
cd backend/
python scripts/import_recipes.py
```

Data files (`recipes_standardized.json`, `entry_mapping.json`) are read from the project root (one level up). Use `--data-dir PATH` to override.

Re-running is safe — the script deletes and reseeds by default. Use `--upsert` for non-destructive updates.

## Run the server

```bash
cd backend/
uvicorn app.main:app --reload
```

Server starts at `http://localhost:8000`. OpenAPI docs at `http://localhost:8000/docs`.

## Run tests

```bash
cd backend/
pytest tests/ -v
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./recipes.db` | SQLite database path |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Comma-separated CORS origins |

## API overview

Base prefix: `/api/v1`

| Method | Path | Description |
|---|---|---|
| GET | `/recipes` | List + filter recipes |
| GET | `/recipes/{id}` | Full recipe detail |
| POST | `/recipes` | Create recipe |
| PUT | `/recipes/{id}` | Full replace |
| PATCH | `/recipes/{id}` | Partial update |
| DELETE | `/recipes/{id}` | Delete recipe |
| GET | `/tags` | All tag categories |
| GET | `/tags/{category}` | Values + counts for one category |
| GET | `/aliases/ingredients` | Full ingredient alias map |
| GET | `/aliases/tags` | Tag slug → display name map |
| GET | `/stats` | Import stats and counts |

### Filter params for `GET /recipes`

- `q` — free text (title or ingredient name)
- `cuisine`, `cooking_method`, `serve_with`, `dietary` — repeatable, OR within field
- `key_ingredient` — repeatable, AND semantics (recipe must have all)
- `has_ingredient` — repeatable, AND semantics, LIKE match on actual ingredients
- `course`, `difficulty`, `total_time` — single value enum filters
- `sort` — `title` (default) | `recent` | `random`
- `limit` — default 50, max 200
- `offset` — default 0

Ingredient alias resolution is applied automatically to `key_ingredient` and `has_ingredient` params (e.g., `capsicum` → `bell pepper`, `hing` → `asafoetida`).

## Reset the database

```bash
rm recipes.db
python scripts/import_recipes.py
```
