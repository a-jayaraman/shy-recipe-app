import json
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.db import get_session
from app import crud
from app.schemas import ParseRecipeResponse, IngredientIn

router = APIRouter(prefix="/parse-recipe", tags=["parse"])

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "~anthropic/claude-sonnet-latest"

# Verbatim copy of SYSTEM_UNSTRUCTURED from tag_recipes.py
SHARED_SCHEMA = """
{
  "title_clean": string,

  "ingredients": [
    {
      "amount": string,   // e.g. "1", "1/2", "2-3" — empty string if unspecified
      "unit":   string,   // e.g. "tsp", "cup", "cloves" — empty string if none
      "name":   string,   // the ingredient name, clean and lowercase
      "notes":  string    // prep notes e.g. "diced", "optional" — empty string if none
    }
  ],

  "instructions": [string],   // ordered list of instruction steps, one step per string,
                               // clean prose (no HTML, no step numbers)

  "tags": {
    "title_clean": string,
    "cuisine": [string],
    "course": string,
    "cooking_method": [string],
    "difficulty": string,
    "total_time": string,
    "serve_with": [string],
    "dietary": [string],
    "key_ingredients": [string],
    "notes": string
  }
}"""

SYSTEM_UNSTRUCTURED = f"""You are a recipe parser and metadata tagger. Given a recipe title and
its raw text, extract clean structured data and return a JSON object with exactly the schema
below. Do not include any explanation, markdown, or extra text — only the raw JSON object.

Schema:
{SHARED_SCHEMA}

Rules:
- All recipes are vegetarian. Do NOT add "vegan" unless there is genuinely no dairy or eggs.
- For Indian recipes, distinguish South Indian vs North Indian when you can tell.
- "spice-mix" course is for recipes that produce a powder or blended spice mix to store.
- "condiment" covers chutneys, sauces, dressings, pickles, pastes.
- instant-pot and pressure-cooker are different methods — use instant-pot only if the recipe
  explicitly mentions an Instant Pot by name.
- Be generous with key_ingredients — include things people would plausibly filter by.
- If the raw text is ambiguous or incomplete, do your best and set tags.notes accordingly.
- Ingredient amounts and units should be strings, not numbers ("1/2" not 0.5).
- Instructions should be clean prose steps — strip any HTML artifacts, merge continuation
  sentences that belong to the same step, split steps that contain multiple distinct actions.
"""


class ParseRecipeRequest(BaseModel):
    text: str = Field(..., max_length=20_000)


@router.post("", response_model=ParseRecipeResponse)
async def parse_recipe(
    body: ParseRecipeRequest,
    session: Session = Depends(get_session),
):
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")

    model = os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
    user_msg = f"Title: (unknown)\n\nRaw content:\n{body.text}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 3000,
                    "messages": [
                        {"role": "system", "content": SYSTEM_UNSTRUCTURED},
                        {"role": "user", "content": user_msg},
                    ],
                },
            )
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {e}")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter returned {resp.status_code}: {resp.text[:300]}",
        )

    raw = resp.json()["choices"][0]["message"]["content"] or ""
    raw = raw.strip()

    # Strip markdown fences if model wraps output
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=422, detail=f"Could not parse LLM response as JSON: {e}")

    tags = data.get("tags", {})

    # Resolve ingredient aliases server-side before returning
    raw_ingredients = data.get("ingredients", [])
    resolved_ingredients: list[IngredientIn] = []
    for ing in raw_ingredients:
        name = ing.get("name", "")
        canonical = crud.resolve_ingredient_alias(session, name) if name else name
        resolved_ingredients.append(IngredientIn(
            amount=ing.get("amount") or None,
            unit=ing.get("unit") or None,
            name=canonical,
            notes=ing.get("notes") or None,
        ))

    return ParseRecipeResponse(
        title=data.get("title_clean", ""),
        servings=None,
        notes=tags.get("notes") or None,
        course=tags.get("course") or None,
        difficulty=tags.get("difficulty") or None,
        total_time=tags.get("total_time") or None,
        ingredients=resolved_ingredients,
        instructions=data.get("instructions", []),
        cuisine=tags.get("cuisine", []),
        cooking_method=tags.get("cooking_method", []),
        serve_with=tags.get("serve_with", []),
        dietary=tags.get("dietary", []),
        key_ingredients=tags.get("key_ingredients", []),
    )
