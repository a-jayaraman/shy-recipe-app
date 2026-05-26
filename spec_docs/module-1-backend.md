# Module 1 — Backend API + Database

## Goal
Build a self-contained Python backend service that stores 147 recipes in SQLite and exposes a REST API with filterable, searchable read endpoints plus full CRUD. This is the foundation for modules 2–4.

## Tech stack (non-negotiable)
- Python 3.11+
- FastAPI
- SQLModel (SQLAlchemy under the hood, Pydantic for serialization)
- SQLite (single file, no external DB process)
- `uv` or `pip` + `requirements.txt` for deps
- `pytest` for tests

## Inputs
- `recipes_standardized.json` — 147 recipes, schema below.
- Each recipe object looks like:
  ```json
  {
    "id": 1,
    "blog_id": "tag:blogger.com,1999:blog-...",
    "title": "Penne Pasta in Tomato Cream Sauce - Instant Pot Pressure Cooker",
    "title_inferred": false,
    "author": "Lakshmi",
    "published": "2020-07-20",
    "updated": "2024-04-01",
    "url_slug": "penne-pasta-tomato-cream-sauce.html",
    "servings": "4",
    "times": {"prep time": "10 minutes", "cook time": "5 minutes"},
    "existing_tags": ["instant pot", "italian"],
    "ingredients_structured": [
      {"amount": "1", "unit": "tsp", "name": "olive oil", "notes": ""},
      ...
    ],
    "instructions_structured": ["Step 1 text...", "Step 2 text...", ...],
    "content_for_tagging": "...",
    "has_structured_data": true,
    "title_clean": "Penne Pasta in Tomato Cream Sauce (Instant Pot)",
    "tags": {
      "title_clean": "...",
      "cuisine": ["Italian"],
      "course": "main",
      "cooking_method": ["instant-pot"],
      "difficulty": "easy",
      "total_time": "under-30-min",
      "serve_with": ["standalone"],
      "dietary": ["contains-dairy"],
      "key_ingredients": ["olive oil", "garlic", "penne pasta", "marinara sauce", ...],
      "notes": ""
    }
  }
  ```

## Database schema

Use SQLModel. Schema:

**recipes**
| column | type | notes |
|---|---|---|
| id | INT PK | reuse from JSON |
| blog_id | TEXT | original blogger post id |
| title | TEXT | original (possibly messy) title |
| title_clean | TEXT | cleaned title — primary display name |
| title_inferred | BOOL | |
| author | TEXT | |
| published | DATE | |
| updated | DATE | |
| url_slug | TEXT | |
| servings | TEXT | freeform |
| times_json | TEXT | JSON dict, e.g. `{"prep time": "10 min"}` |
| course | TEXT | single value: main/side/breakfast/soup/salad/condiment/dessert/snack/spice-mix/drink |
| difficulty | TEXT | easy/medium/hard |
| total_time | TEXT | under-30-min/30-60-min/1-2-hrs/over-2-hrs/unknown |
| notes | TEXT | from tags.notes |
| content_raw | TEXT | keep `content_for_tagging` for future re-tagging |
| has_structured_data | BOOL | |
| existing_tags_json | TEXT | JSON array, original blogger labels, for reference |
| created_at | DATETIME | default now |
| updated_at | DATETIME | default now, auto-update |

**ingredients**
| column | type | notes |
|---|---|---|
| id | INT PK | |
| recipe_id | INT FK → recipes.id, CASCADE |
| order_idx | INT | preserve order |
| amount | TEXT | |
| unit | TEXT | |
| name | TEXT | |
| notes | TEXT | |

**instructions**
| column | type | notes |
|---|---|---|
| id | INT PK | |
| recipe_id | INT FK → recipes.id, CASCADE |
| order_idx | INT | |
| text | TEXT | |

**tags** (unified vocabulary table)
| column | type | notes |
|---|---|---|
| id | INT PK | |
| category | TEXT | one of: `cuisine`, `cooking_method`, `serve_with`, `dietary`, `key_ingredient` |
| value | TEXT | |
| UNIQUE(category, value) | | |

**recipe_tags** (junction)
| column | type | notes |
|---|---|---|
| recipe_id | INT FK → recipes.id, CASCADE |
| tag_id | INT FK → tags.id, CASCADE |
| PRIMARY KEY(recipe_id, tag_id) | | |

Single-valued enums (`course`, `difficulty`, `total_time`) stay as columns on `recipes`. Multi-valued categorical fields go into `tags` + `recipe_tags`.

Indexes:
- `recipes.title_clean` (for search)
- `recipes.course`, `recipes.difficulty`, `recipes.total_time`
- `tags.category`, `tags.value`
- `recipe_tags.recipe_id`, `recipe_tags.tag_id`
- `ingredients.recipe_id`, `ingredients.name` (for ingredient search)

## Import script

`scripts/import_recipes.py`:
- Reads `recipes_standardized.json`
- Idempotent: delete-and-reseed by default; flag `--upsert` for non-destructive update
- Populates `tags` table from union of all values seen
- Reports counts at the end

## REST API endpoints

Base: `/api/v1`

### Read endpoints

```
GET /recipes
```
Query params (all optional, all AND-combined):
- `q` — free text, matches against `title_clean` and ingredient names (LIKE %q%)
- `cuisine` — repeatable: `?cuisine=Italian&cuisine=Chinese` → OR within field
- `course` — single value
- `cooking_method` — repeatable, OR within field
- `serve_with` — repeatable, OR within field
- `dietary` — repeatable, OR within field
- `key_ingredient` — repeatable: `?key_ingredient=tofu&key_ingredient=broccoli` → AND (must contain ALL specified)
- `difficulty` — single value
- `total_time` — single value
- `has_ingredient` — repeatable: like `key_ingredient` but matches against actual ingredients table (broader match) — uses ILIKE so `tomato` matches `cherry tomato`
- `sort` — `title` | `recent` | `random` (default: `title`)
- `limit` — int, default 50, max 200
- `offset` — int, default 0

Response:
```json
{
  "total": 147,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": 1,
      "title_clean": "...",
      "course": "main",
      "cuisine": ["Italian"],
      "cooking_method": ["instant-pot"],
      "difficulty": "easy",
      "total_time": "under-30-min",
      "serve_with": ["standalone"],
      "dietary": ["contains-dairy"],
      "key_ingredients": ["paneer", "tomato", ...],
      "url_slug": "..."
    }
  ]
}
```

```
GET /recipes/{id}
```
Returns full recipe including `ingredients` (ordered array of objects), `instructions` (ordered array of strings), all tags, times, notes.

```
GET /tags/{category}
```
Returns sorted list of all values used in that category, plus a count per value:
```json
{
  "category": "cuisine",
  "values": [
    {"value": "Indian", "count": 65},
    {"value": "Italian", "count": 14},
    ...
  ]
}
```

```
GET /tags
```
Returns all categories with their value lists. Used by frontend to populate filter sidebars.

```
GET /stats
```
Total counts, last-imported timestamp, etc. Useful for debugging.

### Write endpoints

```
POST   /recipes              # create, body = full recipe object
PUT    /recipes/{id}         # full replace
PATCH  /recipes/{id}         # partial update
DELETE /recipes/{id}
```

Write endpoints expect/return the same shape as `GET /recipes/{id}`. On create/update with new tag values, auto-insert into `tags` table.

## Validation

- Pydantic models for all request bodies
- Vocabulary constraints: `course`, `difficulty`, `total_time` must be from the allowed enum lists (return 422 with helpful message)
- Multi-value categorical fields are NOT enum-constrained — they're soft vocabularies that grow. But return a warning in the response if a brand-new value is being added.

## CORS

Enable CORS for `http://localhost:5173` and `http://localhost:3000` (frontend dev ports). Make the allowed origins configurable via env var.

## Project structure

```
backend/
  app/
    __init__.py
    main.py              # FastAPI app instance, CORS, router registration
    db.py                # engine, session, create_all
    models.py            # SQLModel classes
    schemas.py           # Pydantic request/response models if different from DB models
    routers/
      recipes.py
      tags.py
      stats.py
    crud.py              # all DB queries — keep routers thin
  scripts/
    import_recipes.py
  tests/
    test_recipes.py
    test_tags.py
    test_filters.py
    conftest.py
  recipes.db             # gitignored
  recipes_standardized.json   # input data
  pyproject.toml
  requirements.txt
  README.md              # how to run + reset DB
```

## Acceptance criteria

- `pip install -r requirements.txt && python scripts/import_recipes.py && uvicorn app.main:app --reload` works end-to-end
- All 147 recipes load successfully
- OpenAPI docs at `/docs` render and every endpoint is documented
- Test suite covers:
  - Import is idempotent
  - Each filter param works individually
  - Multiple filters combine correctly (AND across fields, OR within multi-value)
  - `key_ingredient` is AND-within-field; `cuisine` is OR-within-field
  - 422s on bad enums
  - CRUD: create → read → update → delete a recipe
- `GET /recipes?key_ingredient=paneer&cuisine=Indian&total_time=under-30-min` returns expected subset
- `GET /tags/key_ingredient` returns all ~340 unique ingredients

## Out of scope

- Auth / users / multi-tenancy
- Image uploads (defer to module 3)
- Caching layer
- Pagination beyond simple limit/offset
- Production deployment concerns (TLS, scaling, etc.)

---

## Amendment — Alias & Display Name System

### Source file
`entry_mapping.json` is the authoritative alias source. It has two top-level keys:

- `"ingredients"` — 764 entries mapping variant names → canonical names. 260 are identity maps (alias == canonical); 504 are real aliases. Import both — the identity maps register the canonical name as valid vocabulary.
- `"tags"` — 42 entries mapping internal slugs → human-readable display names. E.g., `"instant-pot" → "Instant Pot"`, `"gluten-free" → "Gluten-Free"`, `"south indian" → "South Indian"`.

### New tables

**ingredient_aliases**
| column | type | notes |
|---|---|---|
| alias | TEXT PK | lowercase, trimmed — the variant form |
| canonical | TEXT NOT NULL | the canonical ingredient name (matches vocabulary in `tags` table where `category = 'key_ingredient'`) |

Import all 764 entries. Self-referential entries (alias == canonical) are valid — they register a name as canonical.

**tag_display_names**
| column | type | notes |
|---|---|---|
| slug | TEXT PK | the internal stored value — lowercase, hyphenated (matches `tags.value`) |
| display_name | TEXT NOT NULL | human-readable label for the UI |

Import all 42 entries from `entry_mapping.json["tags"]`.

### Import script changes

Extend `scripts/import_recipes.py` to also load both alias tables from `entry_mapping.json`. Import is idempotent (same as recipes — delete-and-reseed or upsert).

### New endpoints

```
GET /aliases/ingredients
```
Returns the full alias → canonical map as a JSON object. Used by the frontend to do client-side alias suggestion without a round-trip per keystroke.

```json
{
  "soya sauce": "soy sauce",
  "capsicum": "bell pepper",
  "hing": "asafoetida",
  ...
}
```

```
GET /aliases/tags
```
Returns the slug → display_name map:
```json
{
  "instant-pot": "Instant Pot",
  "gluten-free": "Gluten-Free",
  "south indian": "South Indian",
  ...
}
```

### Alias resolution in filter queries

When a filter param arrives that touches ingredient names, resolve it through `ingredient_aliases` before querying. Affected params: `key_ingredient`, `has_ingredient`, `q` (when `q` looks like an ingredient name — single word or short phrase with no spaces that matches a known alias).

Resolution logic in `crud.py`:
1. Lowercase + trim the input value
2. Look up in `ingredient_aliases` table
3. If found, use canonical; if not found, use as-is
4. Then run the normal filter

This means `GET /recipes?key_ingredient=capsicum` resolves to `key_ingredient=bell pepper` transparently.

### Alias resolution in `POST /parse-recipe` (Module 3 endpoint)

After the LLM returns a parsed recipe, run ingredient names through alias resolution before returning to the frontend. So if the LLM outputs `"hing"`, the backend normalises it to `"asafoetida"` before the form receives it.

### `GET /tags/{category}` response change

Add `display_name` to each value object where a tag display name exists:

```json
{
  "category": "cooking_method",
  "values": [
    {"value": "instant-pot", "display_name": "Instant Pot", "count": 25},
    {"value": "stovetop",    "display_name": "Stovetop",    "count": 80},
    ...
  ]
}
```

If a value has no entry in `tag_display_names`, `display_name` falls back to the slug itself (title-cased).

### Acceptance criteria additions

- `GET /aliases/ingredients` returns all 764 entries
- `GET /aliases/tags` returns all 42 entries
- `GET /recipes?key_ingredient=capsicum` returns the same results as `?key_ingredient=bell+pepper`
- `GET /recipes?has_ingredient=hing` resolves to `asafoetida` and returns matching recipes
- `GET /tags/cooking_method` includes `display_name` on every entry
- Import is idempotent for alias tables
