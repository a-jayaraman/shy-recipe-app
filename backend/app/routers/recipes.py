import json
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.auth.deps import get_current_user, require_role
from app.db import get_session
from app import crud, schemas
from app.models import COURSE_VALUES, DIFFICULTY_VALUES, TOTAL_TIME_VALUES, User, UserRole

router = APIRouter(prefix="/recipes", tags=["recipes"])


def _build_detail_response(
    recipe,
    ingredients,
    instructions,
    tags_map: dict,
    warnings: list[str] = [],
) -> schemas.RecipeWriteResponse:
    return schemas.RecipeWriteResponse(
        id=recipe.id,
        blog_id=recipe.blog_id,
        title=recipe.title,
        title_clean=recipe.title_clean,
        title_inferred=recipe.title_inferred,
        author=recipe.author,
        published=recipe.published,
        updated=recipe.updated,
        url_slug=recipe.url_slug,
        servings=recipe.servings,
        times=json.loads(recipe.times_json or "{}"),
        course=recipe.course,
        difficulty=recipe.difficulty,
        total_time=recipe.total_time,
        notes=recipe.notes,
        has_structured_data=recipe.has_structured_data,
        existing_tags=json.loads(recipe.existing_tags_json or "[]"),
        cuisine=tags_map.get("cuisine", []),
        cooking_method=tags_map.get("cooking_method", []),
        serve_with=tags_map.get("serve_with", []),
        dietary=tags_map.get("dietary", []),
        key_ingredients=tags_map.get("key_ingredient", []),
        ingredients=[
            schemas.IngredientOut.model_validate(i) for i in ingredients
        ],
        instructions=[i.text for i in instructions],
        warnings=warnings,
    )


@router.get("", response_model=schemas.RecipeListResponse)
def list_recipes(
    q: Optional[str] = None,
    cuisine: list[str] = Query(default=[]),
    course: Optional[str] = None,
    cooking_method: list[str] = Query(default=[]),
    serve_with: list[str] = Query(default=[]),
    dietary: list[str] = Query(default=[]),
    key_ingredient: list[str] = Query(default=[]),
    difficulty: Optional[str] = None,
    total_time: Optional[str] = None,
    has_ingredient: list[str] = Query(default=[]),
    sort: str = "title",
    limit: int = Query(default=50, le=200, ge=1),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    if course and course not in COURSE_VALUES:
        raise HTTPException(422, detail=f"Invalid course. Must be one of: {sorted(COURSE_VALUES)}")
    if difficulty and difficulty not in DIFFICULTY_VALUES:
        raise HTTPException(422, detail=f"Invalid difficulty. Must be one of: {sorted(DIFFICULTY_VALUES)}")
    if total_time and total_time not in TOTAL_TIME_VALUES:
        raise HTTPException(422, detail=f"Invalid total_time. Must be one of: {sorted(TOTAL_TIME_VALUES)}")
    if sort not in {"title", "recent", "random"}:
        raise HTTPException(422, detail="sort must be one of: title, recent, random")

    total, recipes = crud.get_recipes(
        session,
        q=q,
        cuisine=cuisine,
        course=course,
        cooking_method=cooking_method,
        serve_with=serve_with,
        dietary=dietary,
        key_ingredient=key_ingredient,
        difficulty=difficulty,
        total_time=total_time,
        has_ingredient=has_ingredient,
        sort=sort,
        limit=limit,
        offset=offset,
    )

    recipe_ids = [r.id for r in recipes]
    tags_map = crud.get_tags_for_recipe_ids(session, recipe_ids)

    items = [
        schemas.RecipeListItem(
            id=r.id,
            title_clean=r.title_clean,
            course=r.course,
            difficulty=r.difficulty,
            total_time=r.total_time,
            url_slug=r.url_slug,
            cuisine=tags_map[r.id]["cuisine"],
            cooking_method=tags_map[r.id]["cooking_method"],
            serve_with=tags_map[r.id]["serve_with"],
            dietary=tags_map[r.id]["dietary"],
            key_ingredients=tags_map[r.id]["key_ingredient"],
        )
        for r in recipes
    ]
    return schemas.RecipeListResponse(total=total, limit=limit, offset=offset, items=items)


@router.get("/{recipe_id}", response_model=schemas.RecipeDetail)
def get_recipe(recipe_id: int, session: Session = Depends(get_session)):
    result = crud.get_recipe_detail(session, recipe_id)
    if not result:
        raise HTTPException(404, detail="Recipe not found")
    recipe, ingredients, instructions, tags_map = result
    return _build_detail_response(recipe, ingredients, instructions, tags_map)


@router.post("", response_model=schemas.RecipeWriteResponse, status_code=201)
def create_recipe(
    data: schemas.RecipeCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.editor))],
    session: Session = Depends(get_session),
):
    recipe, warnings = crud.create_recipe(session, data, created_by=current_user.id)
    result = crud.get_recipe_detail(session, recipe.id)
    _, ingredients, instructions, tags_map = result
    return _build_detail_response(recipe, ingredients, instructions, tags_map, warnings)


@router.put("/{recipe_id}", response_model=schemas.RecipeWriteResponse)
def update_recipe(
    recipe_id: int,
    data: schemas.RecipeCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.editor))],
    session: Session = Depends(get_session),
):
    result = crud.update_recipe(session, recipe_id, data, updated_by=current_user.id)
    if not result:
        raise HTTPException(404, detail="Recipe not found")
    recipe, warnings = result
    detail = crud.get_recipe_detail(session, recipe.id)
    _, ingredients, instructions, tags_map = detail
    return _build_detail_response(recipe, ingredients, instructions, tags_map, warnings)


@router.patch("/{recipe_id}", response_model=schemas.RecipeWriteResponse)
def patch_recipe(
    recipe_id: int,
    data: schemas.RecipePatch,
    current_user: Annotated[User, Depends(require_role(UserRole.editor))],
    session: Session = Depends(get_session),
):
    result = crud.patch_recipe(session, recipe_id, data, updated_by=current_user.id)
    if not result:
        raise HTTPException(404, detail="Recipe not found")
    recipe, warnings = result
    detail = crud.get_recipe_detail(session, recipe.id)
    _, ingredients, instructions, tags_map = detail
    return _build_detail_response(recipe, ingredients, instructions, tags_map, warnings)


@router.delete("/{recipe_id}", status_code=204)
def delete_recipe(
    recipe_id: int,
    _: Annotated[User, Depends(require_role(UserRole.editor))],
    session: Session = Depends(get_session),
):
    if not crud.delete_recipe(session, recipe_id):
        raise HTTPException(404, detail="Recipe not found")
