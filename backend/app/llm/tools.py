import json

from sqlmodel import Session

from app import crud


TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_recipes",
            "description": (
                "Search the user's recipe collection by any combination of filters. "
                "Use this to find candidates matching the user's request. Returns up to 20 "
                "recipes with summary info. Call multiple times with different filters if needed "
                "to compare options or broaden a too-narrow search."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "cuisine": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "OR within field. Examples: Indian, South Indian, Italian",
                    },
                    "course": {
                        "type": "string",
                        "enum": [
                            "main", "side", "breakfast", "soup", "salad",
                            "condiment", "dessert", "snack", "spice-mix", "drink",
                        ],
                    },
                    "cooking_method": {"type": "array", "items": {"type": "string"}},
                    "serve_with": {"type": "array", "items": {"type": "string"}},
                    "dietary": {"type": "array", "items": {"type": "string"}},
                    "key_ingredient": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "AND within field — recipe must contain ALL listed ingredients",
                    },
                    "has_ingredient": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Looser ingredient match (matches partial names, e.g. 'tomato' matches 'cherry tomato')",
                    },
                    "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                    "total_time": {
                        "type": "string",
                        "enum": ["under-30-min", "30-60-min", "1-2-hrs", "over-2-hrs", "unknown"],
                    },
                    "q": {
                        "type": "string",
                        "description": "Free text search across title and ingredient names",
                    },
                    "limit": {"type": "integer", "default": 20},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recipe",
            "description": (
                "Fetch the full details of a single recipe (all ingredients, all instructions, "
                "all tags). Use this when you need more than the summary returned by "
                "search_recipes to make a recommendation."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                },
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_available_filter_values",
            "description": (
                "List the unique values available for a given filter category. Useful for "
                "figuring out what cuisines/ingredients/etc. exist in this collection before "
                "searching."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": [
                            "cuisine", "cooking_method", "serve_with",
                            "dietary", "key_ingredient", "course",
                        ],
                    },
                },
                "required": ["category"],
            },
        },
    },
]


def _search_recipes(args: dict, session: Session) -> str:
    # Resolve aliases for ingredient-based filters
    raw_key = args.get("key_ingredient") or []
    raw_has = args.get("has_ingredient") or []
    resolved_key = [crud.resolve_ingredient_alias(session, ki) for ki in raw_key]
    resolved_has = [crud.resolve_ingredient_alias(session, hi) for hi in raw_has]

    total, recipes = crud.get_recipes(
        session,
        q=args.get("q"),
        cuisine=args.get("cuisine") or [],
        course=args.get("course"),
        cooking_method=args.get("cooking_method") or [],
        serve_with=args.get("serve_with") or [],
        dietary=args.get("dietary") or [],
        key_ingredient=resolved_key,
        difficulty=args.get("difficulty"),
        total_time=args.get("total_time"),
        has_ingredient=resolved_has,
        limit=min(int(args.get("limit", 20)), 20),
        offset=0,
    )

    recipe_ids = [r.id for r in recipes]
    tags_map = crud.get_tags_for_recipe_ids(session, recipe_ids)

    results = []
    for r in recipes:
        tm = tags_map.get(r.id, {})
        results.append({
            "id": r.id,
            "title": r.title_clean,
            "course": r.course,
            "difficulty": r.difficulty,
            "total_time": r.total_time,
            "cuisine": tm.get("cuisine", []),
            "cooking_method": tm.get("cooking_method", []),
            "serve_with": tm.get("serve_with", []),
            "dietary": tm.get("dietary", []),
            "key_ingredients": tm.get("key_ingredient", []),
        })

    return json.dumps({"total": total, "returned": len(results), "results": results})


def _get_recipe(args: dict, session: Session) -> str:
    recipe_id = int(args["id"])
    detail = crud.get_recipe_detail(session, recipe_id)
    if detail is None:
        return json.dumps({"error": f"Recipe {recipe_id} not found"})

    recipe, ingredients, instructions, tags_map = detail
    return json.dumps({
        "id": recipe.id,
        "title": recipe.title_clean,
        "author": recipe.author,
        "servings": recipe.servings,
        "course": recipe.course,
        "difficulty": recipe.difficulty,
        "total_time": recipe.total_time,
        "notes": recipe.notes,
        "cuisine": tags_map.get("cuisine", []),
        "cooking_method": tags_map.get("cooking_method", []),
        "serve_with": tags_map.get("serve_with", []),
        "dietary": tags_map.get("dietary", []),
        "key_ingredients": tags_map.get("key_ingredient", []),
        "ingredients": [
            {
                "amount": i.amount,
                "unit": i.unit,
                "name": i.name,
                "notes": i.notes,
            }
            for i in ingredients
        ],
        "instructions": [i.text for i in instructions],
    })


def _list_filter_values(args: dict, session: Session) -> str:
    category = args["category"]
    tags = crud.get_tags_by_category(session, category)

    if category == "key_ingredient":
        # Invert alias map: canonical → [aliases]
        alias_dict = crud.get_ingredient_aliases(session)  # {alias: canonical}
        canonical_to_aliases: dict[str, list[str]] = {}
        for alias, canonical in alias_dict.items():
            canonical_to_aliases.setdefault(canonical, []).append(alias)

        values = [
            {
                "canonical": t["value"],
                "aliases": canonical_to_aliases.get(t["value"], []),
                "count": t["count"],
            }
            for t in tags
        ]
    else:
        values = [{"value": t["value"], "count": t["count"]} for t in tags]

    return json.dumps({"category": category, "values": values})


async def execute_tool(name: str, args: dict, session: Session) -> str:
    if name == "search_recipes":
        return _search_recipes(args, session)
    elif name == "get_recipe":
        return _get_recipe(args, session)
    elif name == "list_available_filter_values":
        return _list_filter_values(args, session)
    else:
        return json.dumps({"error": f"Unknown tool: {name}"})
