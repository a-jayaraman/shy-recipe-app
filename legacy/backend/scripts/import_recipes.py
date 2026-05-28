"""Import recipes_standardized.json and entry_mapping.json into the SQLite database.

Usage:
    python scripts/import_recipes.py [--data-dir PATH] [--upsert]

Default behaviour: delete-and-reseed (idempotent).
--upsert: non-destructive update using INSERT OR REPLACE semantics.
"""

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

# Allow running from the backend/ directory or the repo root
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

sys.path.insert(0, str(BACKEND_DIR))

from sqlmodel import Session, create_engine, select
from sqlalchemy import delete, event
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models import (
    Recipe, Ingredient, Instruction, Tag, RecipeTag,
    IngredientAlias, TagDisplayName,
)
from app import db as db_module


def parse_args():
    p = argparse.ArgumentParser(description="Import recipes into the database")
    p.add_argument(
        "--data-dir",
        type=Path,
        default=PROJECT_ROOT,
        help="Directory containing recipes_standardized.json and entry_mapping.json",
    )
    p.add_argument(
        "--upsert",
        action="store_true",
        help="Non-destructive update (INSERT OR REPLACE) instead of delete-and-reseed",
    )
    p.add_argument(
        "--db-url",
        default=None,
        help="SQLite URL (default: sqlite:///./recipes.db relative to backend/)",
    )
    return p.parse_args()


def build_display_to_slug(mapping: dict) -> dict[str, str]:
    """Reverse the tags mapping: display_name -> slug."""
    return {display: slug for slug, display in mapping["tags"].items()}


def display_to_slug_fn(display: str, lookup: dict[str, str]) -> str:
    if display in lookup:
        return lookup[display]
    # Fallback: lowercase only. Do NOT replace spaces — some slugs intentionally
    # contain spaces (e.g. "north indian", "dosa/idli").
    slug = display.lower()
    print(f"WARNING: '{display}' not in tag mapping, using fallback slug: '{slug}'", file=sys.stderr)
    return slug


def collect_tag_pairs(recipes: list[dict], display_to_slug: dict[str, str]) -> list[tuple[str, str]]:
    """Collect unique (category, slug) pairs in insertion order."""
    seen: dict[tuple[str, str], None] = {}
    multi_fields = [
        ("cuisine", "cuisine"),
        ("cooking_method", "cooking_method"),
        ("serve_with", "serve_with"),
        ("dietary", "dietary"),
    ]
    for r in recipes:
        tags = r.get("tags", {})
        for json_key, category in multi_fields:
            for display in tags.get(json_key, []):
                slug = display_to_slug_fn(display, display_to_slug)
                seen[(category, slug)] = None
        for ki in tags.get("key_ingredients", []):
            seen[("key_ingredient", ki.strip().lower())] = None
    return list(seen.keys())


def clear_tables(session: Session):
    """Delete in FK-safe order."""
    session.exec(delete(RecipeTag))
    session.exec(delete(Ingredient))
    session.exec(delete(Instruction))
    session.exec(delete(Tag))
    session.exec(delete(Recipe))
    session.exec(delete(IngredientAlias))
    session.exec(delete(TagDisplayName))
    session.commit()
    print("Cleared all tables.")


def insert_tags(session: Session, tag_pairs: list[tuple[str, str]], upsert: bool) -> dict[tuple[str, str], int]:
    """Insert tags and return {(category, value): id}."""
    tag_lookup: dict[tuple[str, str], int] = {}
    for category, value in tag_pairs:
        if upsert:
            stmt = sqlite_insert(Tag.__table__).values(category=category, value=value)
            stmt = stmt.on_conflict_do_nothing(index_elements=["category", "value"])
            session.exec(stmt)
            # Fetch the id (may already exist)
            row = session.exec(
                select(Tag).where(Tag.category == category, Tag.value == value)
            ).first()
            if row:
                tag_lookup[(category, value)] = row.id
        else:
            tag = Tag(category=category, value=value)
            session.add(tag)
            session.flush()
            tag_lookup[(category, value)] = tag.id
    if not upsert:
        session.flush()
    else:
        session.commit()
        # Reload all tags to get IDs
        all_tags = session.exec(select(Tag)).all()
        for t in all_tags:
            tag_lookup[(t.category, t.value)] = t.id
    return tag_lookup


def parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def import_recipes(
    recipes: list[dict],
    mapping: dict,
    session: Session,
    upsert: bool,
):
    display_to_slug = build_display_to_slug(mapping)
    tag_pairs = collect_tag_pairs(recipes, display_to_slug)

    if not upsert:
        clear_tables(session)

    # ── Tags ──────────────────────────────────────────────────────────────────
    tag_lookup = insert_tags(session, tag_pairs, upsert)

    # ── Alias tables ──────────────────────────────────────────────────────────
    alias_count = 0
    for alias_raw, canonical_raw in mapping["ingredients"].items():
        alias = alias_raw.strip().lower()
        canonical = canonical_raw.strip().lower()
        if upsert:
            stmt = sqlite_insert(IngredientAlias.__table__).values(
                alias=alias, canonical=canonical
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["alias"], set_={"canonical": canonical}
            )
            session.exec(stmt)
        else:
            session.add(IngredientAlias(alias=alias, canonical=canonical))
        alias_count += 1

    display_count = 0
    for slug, display_name in mapping["tags"].items():
        if upsert:
            stmt = sqlite_insert(TagDisplayName.__table__).values(
                slug=slug, display_name=display_name
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["slug"], set_={"display_name": display_name}
            )
            session.exec(stmt)
        else:
            session.add(TagDisplayName(slug=slug, display_name=display_name))
        display_count += 1

    session.flush()

    # ── Recipes, Ingredients, Instructions, RecipeTags ────────────────────────
    recipe_count = 0
    ingredient_count = 0
    instruction_count = 0
    recipe_tag_count = 0

    for r in recipes:
        tags = r.get("tags", {})

        course_display = tags.get("course", "")
        course_slug = display_to_slug_fn(course_display, display_to_slug) if course_display else None

        recipe_data = dict(
            id=r["id"],
            blog_id=r.get("blog_id"),
            title=r.get("title", ""),
            title_clean=r.get("title_clean", r.get("title", "")),
            title_inferred=r.get("title_inferred", False),
            author=r.get("author"),
            published=parse_date(r.get("published")),
            updated=parse_date(r.get("updated")),
            url_slug=r.get("url_slug"),
            servings=r.get("servings") or None,
            times_json=json.dumps(r.get("times", {})),
            course=course_slug,
            difficulty=tags.get("difficulty"),
            total_time=tags.get("total_time"),
            notes=tags.get("notes") or None,
            content_raw=r.get("content_for_tagging"),
            has_structured_data=r.get("has_structured_data", False),
            existing_tags_json=json.dumps(r.get("existing_tags", [])),
        )

        if upsert:
            stmt = sqlite_insert(Recipe.__table__).values(**recipe_data)
            stmt = stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={k: v for k, v in recipe_data.items() if k != "id"},
            )
            session.exec(stmt)
            # Delete related rows before re-inserting
            session.exec(delete(RecipeTag).where(RecipeTag.recipe_id == r["id"]))
            session.exec(delete(Ingredient).where(Ingredient.recipe_id == r["id"]))
            session.exec(delete(Instruction).where(Instruction.recipe_id == r["id"]))
        else:
            session.add(Recipe(**recipe_data))
            session.flush()  # ensure recipe row exists before FK-referencing children

        # Ingredients
        for idx, ing in enumerate(r.get("ingredients_structured", [])):
            session.add(Ingredient(
                recipe_id=r["id"],
                order_idx=idx,
                amount=ing.get("amount") or None,
                unit=ing.get("unit") or None,
                name=ing["name"],
                notes=ing.get("notes") or None,
            ))
            ingredient_count += 1

        # Instructions (recipe 119 has [] — enumerate produces nothing)
        for idx, step in enumerate(r.get("instructions_structured", [])):
            session.add(Instruction(
                recipe_id=r["id"],
                order_idx=idx,
                text=step,
            ))
            instruction_count += 1

        # RecipeTags
        multi_fields = [
            ("cuisine", "cuisine"),
            ("cooking_method", "cooking_method"),
            ("serve_with", "serve_with"),
            ("dietary", "dietary"),
        ]
        for json_key, category in multi_fields:
            for display in tags.get(json_key, []):
                slug = display_to_slug_fn(display, display_to_slug)
                tag_id = tag_lookup.get((category, slug))
                if tag_id is None:
                    print(f"WARNING: tag ({category}, {slug!r}) not in lookup for recipe {r['id']}", file=sys.stderr)
                    continue
                session.add(RecipeTag(recipe_id=r["id"], tag_id=tag_id))
                recipe_tag_count += 1

        for ki in tags.get("key_ingredients", []):
            ki_slug = ki.strip().lower()
            tag_id = tag_lookup.get(("key_ingredient", ki_slug))
            if tag_id is None:
                print(f"WARNING: key_ingredient {ki_slug!r} not in lookup for recipe {r['id']}", file=sys.stderr)
                continue
            session.add(RecipeTag(recipe_id=r["id"], tag_id=tag_id))
            recipe_tag_count += 1

        recipe_count += 1

        if recipe_count % 25 == 0:
            session.flush()

    session.commit()

    print(f"✓ Recipes:            {recipe_count}")
    print(f"✓ Ingredients:        {ingredient_count}")
    print(f"✓ Instructions:       {instruction_count}")
    print(f"✓ Tags (unique):      {len(tag_lookup)}")
    print(f"✓ RecipeTags:         {recipe_tag_count}")
    print(f"✓ Ingredient aliases: {alias_count}")
    print(f"✓ Tag display names:  {display_count}")


def main():
    args = parse_args()

    recipes_path = args.data_dir / "recipes_standardized.json"
    mapping_path = args.data_dir / "entry_mapping.json"

    if not recipes_path.exists():
        print(f"ERROR: {recipes_path} not found", file=sys.stderr)
        sys.exit(1)
    if not mapping_path.exists():
        print(f"ERROR: {mapping_path} not found", file=sys.stderr)
        sys.exit(1)

    print(f"Loading {recipes_path} ...")
    with open(recipes_path) as f:
        recipes = json.load(f)

    print(f"Loading {mapping_path} ...")
    with open(mapping_path) as f:
        mapping = json.load(f)

    print(f"Found {len(recipes)} recipes, {len(mapping['ingredients'])} ingredient aliases, "
          f"{len(mapping['tags'])} tag display names.")

    # Build engine (use env var or default to backend/recipes.db)
    import os
    db_url = args.db_url or os.environ.get(
        "DATABASE_URL",
        f"sqlite:///{BACKEND_DIR / 'recipes.db'}",
    )
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _fk(dbapi_conn, _):
        c = dbapi_conn.cursor()
        c.execute("PRAGMA foreign_keys=ON")
        c.close()

    from sqlmodel import SQLModel
    import app.models  # noqa: F401 — registers metadata
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        import_recipes(recipes, mapping, session, upsert=args.upsert)

    print("Done.")


if __name__ == "__main__":
    main()
