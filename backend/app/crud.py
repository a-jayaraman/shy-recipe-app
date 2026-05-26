import json
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select
from sqlalchemy import func, delete
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models import (
    Recipe, Ingredient, Instruction, Tag, RecipeTag,
    IngredientAlias, TagDisplayName, TAG_CATEGORIES,
)
from app.schemas import RecipeCreate, RecipePatch, IngredientIn


# ── Alias resolution ──────────────────────────────────────────────────────────

def resolve_ingredient_alias(session: Session, value: str) -> str:
    v = value.strip().lower()
    row = session.get(IngredientAlias, v)
    return row.canonical if row else v


# ── Tag helpers ───────────────────────────────────────────────────────────────

def get_or_create_tag(session: Session, category: str, value: str) -> tuple[Tag, bool]:
    """Returns (tag, is_new)."""
    existing = session.exec(
        select(Tag).where(Tag.category == category, Tag.value == value)
    ).first()
    if existing:
        return existing, False
    tag = Tag(category=category, value=value)
    session.add(tag)
    session.flush()
    return tag, True


def get_tags_for_recipe_ids(session: Session, recipe_ids: list[int]) -> dict[int, dict]:
    """Single query; returns {recipe_id: {category: [values]}}."""
    if not recipe_ids:
        return {}

    rows = session.exec(
        select(RecipeTag.recipe_id, Tag.category, Tag.value)
        .join(Tag, RecipeTag.tag_id == Tag.id)
        .where(RecipeTag.recipe_id.in_(recipe_ids))
    ).all()

    result: dict[int, dict] = {
        rid: {cat: [] for cat in TAG_CATEGORIES} for rid in recipe_ids
    }
    for recipe_id, category, value in rows:
        if recipe_id in result and category in result[recipe_id]:
            result[recipe_id][category].append(value)
    return result


def _set_recipe_tags(
    session: Session,
    recipe_id: int,
    *,
    cuisine: list[str],
    cooking_method: list[str],
    serve_with: list[str],
    dietary: list[str],
    key_ingredients: list[str],
) -> list[str]:
    """Delete existing recipe_tags for this recipe and re-insert. Returns warnings."""
    session.exec(delete(RecipeTag).where(RecipeTag.recipe_id == recipe_id))

    warnings: list[str] = []
    tag_fields = {
        "cuisine": cuisine,
        "cooking_method": cooking_method,
        "serve_with": serve_with,
        "dietary": dietary,
        "key_ingredient": key_ingredients,
    }
    for category, values in tag_fields.items():
        for value in values:
            tag, is_new = get_or_create_tag(session, category, value)
            if is_new:
                warnings.append(f"New tag value added: {category}={value!r}")
            session.add(RecipeTag(recipe_id=recipe_id, tag_id=tag.id))
    return warnings


# ── Recipe list ───────────────────────────────────────────────────────────────

def get_recipes(
    session: Session,
    *,
    q: Optional[str] = None,
    cuisine: list[str] = [],
    course: Optional[str] = None,
    cooking_method: list[str] = [],
    serve_with: list[str] = [],
    dietary: list[str] = [],
    key_ingredient: list[str] = [],
    difficulty: Optional[str] = None,
    total_time: Optional[str] = None,
    has_ingredient: list[str] = [],
    sort: str = "title",
    limit: int = 50,
    offset: int = 0,
) -> tuple[int, list[Recipe]]:

    stmt = select(Recipe)

    # Free text: title_clean OR ingredient name
    if q:
        q_pat = f"%{q.lower()}%"
        ing_subq = select(Ingredient.recipe_id).where(
            func.lower(Ingredient.name).like(q_pat)
        )
        from sqlalchemy import or_
        stmt = stmt.where(
            or_(
                func.lower(Recipe.title_clean).like(q_pat),
                Recipe.id.in_(ing_subq),
            )
        )

    # Single-value enum columns
    if course:
        stmt = stmt.where(Recipe.course == course)
    if difficulty:
        stmt = stmt.where(Recipe.difficulty == difficulty)
    if total_time:
        stmt = stmt.where(Recipe.total_time == total_time)

    # Multi-value OR filters
    for category, values in [
        ("cuisine", cuisine),
        ("cooking_method", cooking_method),
        ("serve_with", serve_with),
        ("dietary", dietary),
    ]:
        if values:
            tag_subq = (
                select(RecipeTag.recipe_id)
                .join(Tag, RecipeTag.tag_id == Tag.id)
                .where(Tag.category == category, Tag.value.in_(values))
            )
            stmt = stmt.where(Recipe.id.in_(tag_subq))

    # key_ingredient: AND semantics (one subquery per value)
    for ki in key_ingredient:
        resolved = resolve_ingredient_alias(session, ki)
        tag_subq = (
            select(RecipeTag.recipe_id)
            .join(Tag, RecipeTag.tag_id == Tag.id)
            .where(Tag.category == "key_ingredient", Tag.value == resolved)
        )
        stmt = stmt.where(Recipe.id.in_(tag_subq))

    # has_ingredient: AND semantics, LIKE match on actual ingredients table
    for hi in has_ingredient:
        resolved = resolve_ingredient_alias(session, hi)
        ing_subq = (
            select(Ingredient.recipe_id)
            .where(func.lower(Ingredient.name).like(f"%{resolved}%"))
        )
        stmt = stmt.where(Recipe.id.in_(ing_subq))

    # Count before sort/pagination
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = session.exec(count_stmt).one()

    # Sort
    if sort == "recent":
        stmt = stmt.order_by(Recipe.published.desc())
    elif sort == "random":
        stmt = stmt.order_by(func.random())
    else:
        stmt = stmt.order_by(func.lower(Recipe.title_clean))

    stmt = stmt.offset(offset).limit(limit)
    recipes = list(session.exec(stmt).all())
    return total, recipes


# ── Recipe detail ─────────────────────────────────────────────────────────────

def get_recipe_detail(
    session: Session, recipe_id: int
) -> Optional[tuple[Recipe, list[Ingredient], list[Instruction], dict]]:
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        return None

    ingredients = list(
        session.exec(
            select(Ingredient)
            .where(Ingredient.recipe_id == recipe_id)
            .order_by(Ingredient.order_idx)
        ).all()
    )
    instructions = list(
        session.exec(
            select(Instruction)
            .where(Instruction.recipe_id == recipe_id)
            .order_by(Instruction.order_idx)
        ).all()
    )
    tags_map = get_tags_for_recipe_ids(session, [recipe_id])[recipe_id]
    return recipe, ingredients, instructions, tags_map


# ── Write operations ──────────────────────────────────────────────────────────

def create_recipe(session: Session, data: RecipeCreate) -> tuple[Recipe, list[str]]:
    recipe = Recipe(
        title=data.title,
        title_clean=data.title_clean,
        blog_id=data.blog_id,
        title_inferred=data.title_inferred,
        author=data.author,
        published=data.published,
        updated=data.updated,
        url_slug=data.url_slug,
        servings=data.servings,
        times_json=json.dumps(data.times),
        course=data.course,
        difficulty=data.difficulty,
        total_time=data.total_time,
        notes=data.notes,
        content_raw=data.content_raw,
        has_structured_data=data.has_structured_data,
        existing_tags_json=json.dumps(data.existing_tags),
    )
    session.add(recipe)
    session.flush()

    for idx, ing in enumerate(data.ingredients):
        session.add(Ingredient(
            recipe_id=recipe.id,
            order_idx=idx,
            amount=ing.amount,
            unit=ing.unit,
            name=ing.name,
            notes=ing.notes,
        ))
    for idx, text in enumerate(data.instructions):
        session.add(Instruction(recipe_id=recipe.id, order_idx=idx, text=text))

    warnings = _set_recipe_tags(
        session, recipe.id,
        cuisine=data.cuisine,
        cooking_method=data.cooking_method,
        serve_with=data.serve_with,
        dietary=data.dietary,
        key_ingredients=data.key_ingredients,
    )
    session.commit()
    session.refresh(recipe)
    return recipe, warnings


def update_recipe(
    session: Session, recipe_id: int, data: RecipeCreate
) -> Optional[tuple[Recipe, list[str]]]:
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        return None

    recipe.title = data.title
    recipe.title_clean = data.title_clean
    recipe.blog_id = data.blog_id
    recipe.title_inferred = data.title_inferred
    recipe.author = data.author
    recipe.published = data.published
    recipe.updated = data.updated
    recipe.url_slug = data.url_slug
    recipe.servings = data.servings
    recipe.times_json = json.dumps(data.times)
    recipe.course = data.course
    recipe.difficulty = data.difficulty
    recipe.total_time = data.total_time
    recipe.notes = data.notes
    recipe.content_raw = data.content_raw
    recipe.has_structured_data = data.has_structured_data
    recipe.existing_tags_json = json.dumps(data.existing_tags)
    session.add(recipe)

    session.exec(delete(Ingredient).where(Ingredient.recipe_id == recipe_id))
    session.exec(delete(Instruction).where(Instruction.recipe_id == recipe_id))
    for idx, ing in enumerate(data.ingredients):
        session.add(Ingredient(
            recipe_id=recipe_id, order_idx=idx,
            amount=ing.amount, unit=ing.unit, name=ing.name, notes=ing.notes,
        ))
    for idx, text in enumerate(data.instructions):
        session.add(Instruction(recipe_id=recipe_id, order_idx=idx, text=text))

    warnings = _set_recipe_tags(
        session, recipe_id,
        cuisine=data.cuisine,
        cooking_method=data.cooking_method,
        serve_with=data.serve_with,
        dietary=data.dietary,
        key_ingredients=data.key_ingredients,
    )
    session.commit()
    session.refresh(recipe)
    return recipe, warnings


def patch_recipe(
    session: Session, recipe_id: int, data: RecipePatch
) -> Optional[tuple[Recipe, list[str]]]:
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        return None

    patch_dict = data.model_dump(exclude_unset=True)

    # Fields that need special handling
    tags_fields = {"cuisine", "cooking_method", "serve_with", "dietary", "key_ingredients"}
    ingredient_fields = {"ingredients", "instructions", "times", "existing_tags"}

    scalar_updates = {
        k: v for k, v in patch_dict.items()
        if k not in tags_fields and k not in ingredient_fields
    }
    for k, v in scalar_updates.items():
        setattr(recipe, k, v)

    if "times" in patch_dict:
        recipe.times_json = json.dumps(patch_dict["times"])
    if "existing_tags" in patch_dict:
        recipe.existing_tags_json = json.dumps(patch_dict["existing_tags"])
    session.add(recipe)

    if "ingredients" in patch_dict:
        session.exec(delete(Ingredient).where(Ingredient.recipe_id == recipe_id))
        for idx, ing in enumerate(patch_dict["ingredients"]):
            if isinstance(ing, IngredientIn):
                session.add(Ingredient(recipe_id=recipe_id, order_idx=idx, amount=ing.amount, unit=ing.unit, name=ing.name, notes=ing.notes))
            else:
                session.add(Ingredient(recipe_id=recipe_id, order_idx=idx, **ing))

    if "instructions" in patch_dict:
        session.exec(delete(Instruction).where(Instruction.recipe_id == recipe_id))
        for idx, text in enumerate(patch_dict["instructions"]):
            session.add(Instruction(recipe_id=recipe_id, order_idx=idx, text=text))

    warnings: list[str] = []
    if tags_fields & set(patch_dict.keys()):
        current_tags = get_tags_for_recipe_ids(session, [recipe_id])[recipe_id]
        warnings = _set_recipe_tags(
            session, recipe_id,
            cuisine=patch_dict.get("cuisine", current_tags["cuisine"]),
            cooking_method=patch_dict.get("cooking_method", current_tags["cooking_method"]),
            serve_with=patch_dict.get("serve_with", current_tags["serve_with"]),
            dietary=patch_dict.get("dietary", current_tags["dietary"]),
            key_ingredients=patch_dict.get("key_ingredients", current_tags["key_ingredient"]),
        )

    session.commit()
    session.refresh(recipe)
    return recipe, warnings


def delete_recipe(session: Session, recipe_id: int) -> bool:
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        return False
    # FK cascade requires PRAGMA foreign_keys=ON (set in db.py connect event)
    session.exec(delete(RecipeTag).where(RecipeTag.recipe_id == recipe_id))
    session.exec(delete(Ingredient).where(Ingredient.recipe_id == recipe_id))
    session.exec(delete(Instruction).where(Instruction.recipe_id == recipe_id))
    session.delete(recipe)
    session.commit()
    return True


# ── Tags ──────────────────────────────────────────────────────────────────────

def get_tags_by_category(session: Session, category: str) -> list[dict]:
    rows = session.exec(
        select(Tag.value, func.count(RecipeTag.recipe_id).label("cnt"))
        .join(RecipeTag, Tag.id == RecipeTag.tag_id)
        .where(Tag.category == category)
        .group_by(Tag.value)
        .order_by(func.count(RecipeTag.recipe_id).desc(), Tag.value)
    ).all()

    slugs = [r[0] for r in rows]
    display_rows = session.exec(
        select(TagDisplayName).where(TagDisplayName.slug.in_(slugs))
    ).all()
    display_map = {d.slug: d.display_name for d in display_rows}

    return [
        {
            "value": value,
            "count": cnt,
            "display_name": display_map.get(value, value.replace("-", " ").title()),
        }
        for value, cnt in rows
    ]


def get_all_tags(session: Session) -> dict[str, list[dict]]:
    return {cat: get_tags_by_category(session, cat) for cat in TAG_CATEGORIES}


# ── Aliases ───────────────────────────────────────────────────────────────────

def get_ingredient_aliases(session: Session) -> dict[str, str]:
    rows = session.exec(select(IngredientAlias)).all()
    return {row.alias: row.canonical for row in rows}


def get_tag_display_names(session: Session) -> dict[str, str]:
    rows = session.exec(select(TagDisplayName)).all()
    return {row.slug: row.display_name for row in rows}


# ── Stats ─────────────────────────────────────────────────────────────────────

def get_stats(session: Session) -> dict:
    recipe_count = session.exec(select(func.count(Recipe.id))).one()
    ingredient_count = session.exec(select(func.count(Ingredient.id))).one()
    unique_tag_count = session.exec(select(func.count(Tag.id))).one()
    alias_count = session.exec(select(func.count(IngredientAlias.alias))).one()
    display_count = session.exec(select(func.count(TagDisplayName.slug))).one()
    last_imported = session.exec(
        select(func.max(Recipe.created_at))
    ).one()
    return {
        "recipe_count": recipe_count,
        "ingredient_count": ingredient_count,
        "unique_tag_count": unique_tag_count,
        "ingredient_alias_count": alias_count,
        "tag_display_name_count": display_count,
        "last_imported": last_imported,
    }
