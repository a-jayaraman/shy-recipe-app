"""
Migrate data from SQLite (backend/recipes.db) to Supabase Postgres.

Usage:
    SUPABASE_DB_URL="postgres://postgres:<password>@db.<project>.supabase.co:5432/postgres" \
      python scripts/migrate_sqlite_to_supabase.py

The SUPABASE_DB_URL is the *direct connection* string from:
  Supabase dashboard → Settings → Database → Connection string (URI tab)

Requirements:
    pip install psycopg2-binary

The script is idempotent — it uses ON CONFLICT DO NOTHING so it is safe to re-run.
After running, verify in the Supabase SQL editor:
    select count(*) from recipes;
    select count(*) from ingredients;
    select count(*) from tags;
    select * from aliases where alias = 'capsicum';  -- expect: bell pepper
"""

import os
import sqlite3
import sys
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("psycopg2-binary not installed. Run: pip install psycopg2-binary")

SQLITE_PATH = Path(__file__).parent.parent / "backend" / "recipes.db"

DB_URL = os.environ.get("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("Set SUPABASE_DB_URL environment variable to the Supabase direct connection string.")

if not SQLITE_PATH.exists():
    sys.exit(f"SQLite database not found: {SQLITE_PATH}")


def main() -> None:
    print(f"Reading from: {SQLITE_PATH}")
    src = sqlite3.connect(str(SQLITE_PATH))
    src.row_factory = sqlite3.Row

    print(f"Connecting to Supabase Postgres…")
    dst = psycopg2.connect(DB_URL)
    cur = dst.cursor()

    # ------------------------------------------------------------------
    # recipes
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM recipes").fetchall()
    print(f"Migrating {len(rows)} recipes…")
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO public.recipes (
          id, blog_id, title, title_clean, title_inferred, author,
          published, updated, url_slug, servings, times_json,
          course, difficulty, total_time, notes, content_raw,
          has_structured_data, existing_tags_json, created_at, updated_at
        ) VALUES (
          %(id)s, %(blog_id)s, %(title)s, %(title_clean)s, %(title_inferred)s, %(author)s,
          %(published)s, %(updated)s, %(url_slug)s, %(servings)s, %(times_json)s,
          %(course)s, %(difficulty)s, %(total_time)s, %(notes)s, %(content_raw)s,
          %(has_structured_data)s, %(existing_tags_json)s, %(created_at)s, %(updated_at)s
        )
        ON CONFLICT (id) DO NOTHING
        """,
        [dict(r) for r in rows],
    )
    # Advance the sequence past the migrated IDs so new inserts don't collide
    if rows:
        max_id = max(r["id"] for r in rows)
        cur.execute(f"SELECT setval('public.recipes_id_seq', {max_id}, true)")
    dst.commit()

    # ------------------------------------------------------------------
    # ingredients
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM ingredients").fetchall()
    print(f"Migrating {len(rows)} ingredients…")
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO public.ingredients (id, recipe_id, order_idx, amount, unit, name, notes)
        VALUES (%(id)s, %(recipe_id)s, %(order_idx)s, %(amount)s, %(unit)s, %(name)s, %(notes)s)
        ON CONFLICT (id) DO NOTHING
        """,
        [dict(r) for r in rows],
    )
    if rows:
        max_id = max(r["id"] for r in rows)
        cur.execute(f"SELECT setval('public.ingredients_id_seq', {max_id}, true)")
    dst.commit()

    # ------------------------------------------------------------------
    # instructions
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM instructions").fetchall()
    print(f"Migrating {len(rows)} instructions…")
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO public.instructions (id, recipe_id, order_idx, text)
        VALUES (%(id)s, %(recipe_id)s, %(order_idx)s, %(text)s)
        ON CONFLICT (id) DO NOTHING
        """,
        [dict(r) for r in rows],
    )
    if rows:
        max_id = max(r["id"] for r in rows)
        cur.execute(f"SELECT setval('public.instructions_id_seq', {max_id}, true)")
    dst.commit()

    # ------------------------------------------------------------------
    # tags
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM tags").fetchall()
    print(f"Migrating {len(rows)} tags…")
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO public.tags (id, category, value)
        VALUES (%(id)s, %(category)s, %(value)s)
        ON CONFLICT (id) DO NOTHING
        """,
        [dict(r) for r in rows],
    )
    if rows:
        max_id = max(r["id"] for r in rows)
        cur.execute(f"SELECT setval('public.tags_id_seq', {max_id}, true)")
    dst.commit()

    # ------------------------------------------------------------------
    # recipe_tags
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM recipe_tags").fetchall()
    print(f"Migrating {len(rows)} recipe_tags…")
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO public.recipe_tags (recipe_id, tag_id)
        VALUES (%(recipe_id)s, %(tag_id)s)
        ON CONFLICT DO NOTHING
        """,
        [dict(r) for r in rows],
    )
    dst.commit()

    # ------------------------------------------------------------------
    # aliases  (SQLite table: ingredient_aliases)
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM ingredient_aliases").fetchall()
    print(f"Migrating {len(rows)} ingredient aliases…")
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO public.aliases (alias, canonical)
        VALUES (%(alias)s, %(canonical)s)
        ON CONFLICT (alias) DO NOTHING
        """,
        [dict(r) for r in rows],
    )
    dst.commit()

    # ------------------------------------------------------------------
    # tag_display_names
    # ------------------------------------------------------------------
    rows = src.execute("SELECT * FROM tag_display_names").fetchall()
    print(f"Migrating {len(rows)} tag display names…")
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO public.tag_display_names (slug, display_name)
        VALUES (%(slug)s, %(display_name)s)
        ON CONFLICT (slug) DO NOTHING
        """,
        [dict(r) for r in rows],
    )
    dst.commit()

    cur.close()
    src.close()
    dst.close()
    print("Migration complete.")
    print()
    print("Verify with these queries in the Supabase SQL editor:")
    print("  select count(*) from recipes;")
    print("  select count(*) from ingredients;")
    print("  select count(*) from tags;")
    print("  select * from aliases where alias = 'capsicum';")


if __name__ == "__main__":
    main()
