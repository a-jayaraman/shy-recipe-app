from datetime import date, datetime
from typing import Optional, Any
from pydantic import BaseModel, field_validator

from app.models import COURSE_VALUES, DIFFICULTY_VALUES, TOTAL_TIME_VALUES


# ── Sub-objects ──────────────────────────────────────────────────────────────

class IngredientOut(BaseModel):
    order_idx: int
    amount: Optional[str] = None
    unit: Optional[str] = None
    name: str
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


# ── List view ─────────────────────────────────────────────────────────────────

class RecipeListItem(BaseModel):
    id: int
    title_clean: str
    course: Optional[str] = None
    cuisine: list[str] = []
    cooking_method: list[str] = []
    difficulty: Optional[str] = None
    total_time: Optional[str] = None
    serve_with: list[str] = []
    dietary: list[str] = []
    key_ingredients: list[str] = []
    url_slug: Optional[str] = None


class RecipeListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[RecipeListItem]


# ── Detail view ───────────────────────────────────────────────────────────────

class RecipeDetail(BaseModel):
    id: int
    blog_id: Optional[str] = None
    title: str
    title_clean: str
    title_inferred: bool = False
    author: Optional[str] = None
    published: Optional[date] = None
    updated: Optional[date] = None
    url_slug: Optional[str] = None
    servings: Optional[str] = None
    times: dict[str, Any] = {}
    course: Optional[str] = None
    difficulty: Optional[str] = None
    total_time: Optional[str] = None
    notes: Optional[str] = None
    has_structured_data: bool = False
    cuisine: list[str] = []
    cooking_method: list[str] = []
    serve_with: list[str] = []
    dietary: list[str] = []
    key_ingredients: list[str] = []
    ingredients: list[IngredientOut] = []
    instructions: list[str] = []
    existing_tags: list[str] = []


# ── Write schemas ─────────────────────────────────────────────────────────────

class IngredientIn(BaseModel):
    amount: Optional[str] = None
    unit: Optional[str] = None
    name: str
    notes: Optional[str] = None


class RecipeCreate(BaseModel):
    title: str
    title_clean: str
    blog_id: Optional[str] = None
    title_inferred: bool = False
    author: Optional[str] = None
    published: Optional[date] = None
    updated: Optional[date] = None
    url_slug: Optional[str] = None
    servings: Optional[str] = None
    times: dict[str, Any] = {}
    course: Optional[str] = None
    difficulty: Optional[str] = None
    total_time: Optional[str] = None
    notes: Optional[str] = None
    content_raw: Optional[str] = None
    has_structured_data: bool = False
    existing_tags: list[str] = []
    cuisine: list[str] = []
    cooking_method: list[str] = []
    serve_with: list[str] = []
    dietary: list[str] = []
    key_ingredients: list[str] = []
    ingredients: list[IngredientIn] = []
    instructions: list[str] = []

    @field_validator("course")
    @classmethod
    def validate_course(cls, v):
        if v is not None and v not in COURSE_VALUES:
            raise ValueError(f"course must be one of: {sorted(COURSE_VALUES)}")
        return v

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v):
        if v is not None and v not in DIFFICULTY_VALUES:
            raise ValueError(f"difficulty must be one of: {sorted(DIFFICULTY_VALUES)}")
        return v

    @field_validator("total_time")
    @classmethod
    def validate_total_time(cls, v):
        if v is not None and v not in TOTAL_TIME_VALUES:
            raise ValueError(f"total_time must be one of: {sorted(TOTAL_TIME_VALUES)}")
        return v


class RecipePatch(BaseModel):
    title: Optional[str] = None
    title_clean: Optional[str] = None
    blog_id: Optional[str] = None
    title_inferred: Optional[bool] = None
    author: Optional[str] = None
    published: Optional[date] = None
    updated: Optional[date] = None
    url_slug: Optional[str] = None
    servings: Optional[str] = None
    times: Optional[dict[str, Any]] = None
    course: Optional[str] = None
    difficulty: Optional[str] = None
    total_time: Optional[str] = None
    notes: Optional[str] = None
    content_raw: Optional[str] = None
    has_structured_data: Optional[bool] = None
    existing_tags: Optional[list[str]] = None
    cuisine: Optional[list[str]] = None
    cooking_method: Optional[list[str]] = None
    serve_with: Optional[list[str]] = None
    dietary: Optional[list[str]] = None
    key_ingredients: Optional[list[str]] = None
    ingredients: Optional[list[IngredientIn]] = None
    instructions: Optional[list[str]] = None

    @field_validator("course")
    @classmethod
    def validate_course(cls, v):
        if v is not None and v not in COURSE_VALUES:
            raise ValueError(f"course must be one of: {sorted(COURSE_VALUES)}")
        return v

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v):
        if v is not None and v not in DIFFICULTY_VALUES:
            raise ValueError(f"difficulty must be one of: {sorted(DIFFICULTY_VALUES)}")
        return v

    @field_validator("total_time")
    @classmethod
    def validate_total_time(cls, v):
        if v is not None and v not in TOTAL_TIME_VALUES:
            raise ValueError(f"total_time must be one of: {sorted(TOTAL_TIME_VALUES)}")
        return v


# ── Tag responses ─────────────────────────────────────────────────────────────

class TagValue(BaseModel):
    value: str
    display_name: str
    count: int


class TagCategoryResponse(BaseModel):
    category: str
    values: list[TagValue]


class AllTagsResponse(BaseModel):
    categories: dict[str, list[TagValue]]


# ── Stats ─────────────────────────────────────────────────────────────────────

class StatsResponse(BaseModel):
    recipe_count: int
    ingredient_count: int
    unique_tag_count: int
    ingredient_alias_count: int
    tag_display_name_count: int
    last_imported: Optional[datetime] = None


# ── Write response (includes warnings for new tag values) ─────────────────────

class RecipeWriteResponse(RecipeDetail):
    warnings: list[str] = []


# ── Parse-recipe response (LLM assist) ───────────────────────────────────────

class ParseRecipeResponse(BaseModel):
    title: str = ""
    servings: Optional[str] = None
    notes: Optional[str] = None
    course: Optional[str] = None
    difficulty: Optional[str] = None
    total_time: Optional[str] = None
    ingredients: list[IngredientIn] = []
    instructions: list[str] = []
    cuisine: list[str] = []
    cooking_method: list[str] = []
    serve_with: list[str] = []
    dietary: list[str] = []
    key_ingredients: list[str] = []
