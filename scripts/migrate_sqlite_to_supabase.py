"""
Migrate data from SQLite (legacy/backend/recipes.db) to Supabase via the REST API.

Uses HTTPS (port 443) — works in WSL2 and any network that blocks port 5432.

Usage:
    SUPABASE_URL="https://<project>.supabase.co" \
    SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
      python scripts/migrate_sqlite_to_supabase.py

Where to find these values:
  SUPABASE_URL            → Supabase dashboard → Settings → API → Project URL
  SUPABASE_SERVICE_ROLE_KEY → Supabase dashboard → Settings → API → service_role (secret)

The service role key is required (not the anon key) to bypass RLS during seeding.

Requirements:
    pip install requests

The script is idempotent — duplicate rows are silently ignored.

After running, verify in the Supabase SQL editor:
    select count(*) from recipes;
    select count(*) from ingredients;
    select count(*) from tags;
    select * from aliases where alias = 'capsicum';  -- expect: bell pepper

Then reset sequences so new inserts don't collide with migrated IDs:
    select setval('public.recipes_id_seq',     (select max(id) from public.recipes));
    select setval('public.ingredients_id_seq', (select max(id) from public.ingredients));
    select setval('public.instructions_id_seq',(select max(id) from public.instructions));
    select setval('public.tags_id_seq',        (select max(id) from public.tags));
"""

import os
import sqlite3
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("requests not installed. Run: pip install requests")

SQLITE_PATH = Path(__file__).parent.parent / "legacy" / "backend" / "recipes.db"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL:
    sys.exit("Set SUPABASE_URL to your project URL (e.g. https://<project>.supabase.co)")
if not SERVICE_ROLE_KEY:
    sys.exit("Set SUPABASE_SERVICE_ROLE_KEY to your service role key (from Settings → API)")
if not SQLITE_PATH.exists():
    sys.exit(f"SQLite database not found: {SQLITE_PATH}")

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    # ignore-duplicates = ON CONFLICT DO NOTHING via PostgREST
    "Prefer": "return=minimal,resolution=ignore-duplicates",
}

BATCH_SIZE = 200


def rest_url(table: str) -> str:
    return f"{SUPABASE_URL}/rest/v1/{table}"


def insert_batch(table: str, rows: list[dict]) -> None:
    """POST a batch of rows to a PostgREST table endpoint."""
    if not rows:
        return
    resp = requests.post(rest_url(table), json=rows, headers=HEADERS, timeout=60)
    if resp.status_code not in (200, 201):
        sys.exit(f"Insert into {table} failed ({resp.status_code}): {resp.text[:400]}")


def insert_all(table: str, rows: list[dict]) -> None:
    for i in range(0, len(rows), BATCH_SIZE):
        insert_batch(table, rows[i : i + BATCH_SIZE])


def main() -> None:
    print(f"Reading from: {SQLITE_PATH}")
    src = sqlite3.connect(str(SQLITE_PATH))
    src.row_factory = sqlite3.Row

    # ------------------------------------------------------------------
    # recipes
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM recipes").fetchall()
    print(f"Migrating {len(rows)} recipes…")
    recipe_rows = [
        {k: row[k] for k in (
            "id", "blog_id", "title", "title_clean", "title_inferred", "author",
            "published", "updated", "url_slug", "servings", "times_json",
            "course", "difficulty", "total_time", "notes", "content_raw",
            "has_structured_data", "existing_tags_json", "created_at", "updated_at",
        )}
        for row in rows
    ]
    insert_all("recipes", recipe_rows)

    # ------------------------------------------------------------------
    # ingredients
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM ingredients").fetchall()
    print(f"Migrating {len(rows)} ingredients…")
    insert_all("ingredients", [
        {k: row[k] for k in ("id", "recipe_id", "order_idx", "amount", "unit", "name", "notes")}
        for row in rows
    ])

    # ------------------------------------------------------------------
    # instructions
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM instructions").fetchall()
    print(f"Migrating {len(rows)} instructions…")
    insert_all("instructions", [
        {k: row[k] for k in ("id", "recipe_id", "order_idx", "text")}
        for row in rows
    ])

    # ------------------------------------------------------------------
    # tags
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM tags").fetchall()
    print(f"Migrating {len(rows)} tags…")
    insert_all("tags", [
        {k: row[k] for k in ("id", "category", "value")}
        for row in rows
    ])

    # ------------------------------------------------------------------
    # recipe_tags
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM recipe_tags").fetchall()
    print(f"Migrating {len(rows)} recipe_tags…")
    insert_all("recipe_tags", [
        {k: row[k] for k in ("recipe_id", "tag_id")}
        for row in rows
    ])

    # ------------------------------------------------------------------
    # aliases  (SQLite table: ingredient_aliases)
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM ingredient_aliases").fetchall()
    print(f"Migrating {len(rows)} ingredient aliases…")
    insert_all("aliases", [
        {k: row[k] for k in ("alias", "canonical")}
        for row in rows
    ])

    # ------------------------------------------------------------------
    # tag_display_names
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM tag_display_names").fetchall()
    print(f"Migrating {len(rows)} tag display names…")
    insert_all("tag_display_names", [
        {k: row[k] for k in ("slug", "display_name")}
        for row in rows
    ])

    src.close()
    print("\nMigration complete.")
    print()
    print("Now run these in the Supabase SQL editor to reset sequences:")
    print("  select setval('public.recipes_id_seq',     (select max(id) from public.recipes));")
    print("  select setval('public.ingredients_id_seq', (select max(id) from public.ingredients));")
    print("  select setval('public.instructions_id_seq',(select max(id) from public.instructions));")
    print("  select setval('public.tags_id_seq',        (select max(id) from public.tags));")
    print()
    print("Then verify:")
    print("  select count(*) from recipes;")
    print("  select count(*) from ingredients;")
    print("  select count(*) from tags;")
    print("  select * from aliases where alias = 'capsicum';")


if __name__ == "__main__":
    main()
