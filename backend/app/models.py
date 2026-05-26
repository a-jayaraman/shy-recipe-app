from datetime import date, datetime
from typing import Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, DateTime, UniqueConstraint

COURSE_VALUES = {
    "main", "side", "breakfast", "soup", "salad",
    "condiment", "dessert", "snack", "spice-mix", "drink",
}
DIFFICULTY_VALUES = {"easy", "medium", "hard"}
TOTAL_TIME_VALUES = {"under-30-min", "30-60-min", "1-2-hrs", "over-2-hrs", "unknown"}
TAG_CATEGORIES = {"cuisine", "cooking_method", "serve_with", "dietary", "key_ingredient"}


class Recipe(SQLModel, table=True):
    __tablename__ = "recipes"
    id: int = Field(primary_key=True)
    blog_id: Optional[str] = None
    title: str
    title_clean: str
    title_inferred: bool = False
    author: Optional[str] = None
    published: Optional[date] = None
    updated: Optional[date] = None
    url_slug: Optional[str] = None
    servings: Optional[str] = None
    times_json: Optional[str] = None
    course: Optional[str] = None
    difficulty: Optional[str] = None
    total_time: Optional[str] = None
    notes: Optional[str] = None
    content_raw: Optional[str] = None
    has_structured_data: bool = False
    existing_tags_json: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow),
    )


class Ingredient(SQLModel, table=True):
    __tablename__ = "ingredients"
    id: Optional[int] = Field(default=None, primary_key=True)
    recipe_id: int = Field(foreign_key="recipes.id")
    order_idx: int
    amount: Optional[str] = None
    unit: Optional[str] = None
    name: str
    notes: Optional[str] = None


class Instruction(SQLModel, table=True):
    __tablename__ = "instructions"
    id: Optional[int] = Field(default=None, primary_key=True)
    recipe_id: int = Field(foreign_key="recipes.id")
    order_idx: int
    text: str


class Tag(SQLModel, table=True):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("category", "value", name="uq_tag_cat_val"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    category: str
    value: str


class RecipeTag(SQLModel, table=True):
    __tablename__ = "recipe_tags"
    recipe_id: int = Field(foreign_key="recipes.id", primary_key=True)
    tag_id: int = Field(foreign_key="tags.id", primary_key=True)


class IngredientAlias(SQLModel, table=True):
    __tablename__ = "ingredient_aliases"
    alias: str = Field(primary_key=True)
    canonical: str


class TagDisplayName(SQLModel, table=True):
    __tablename__ = "tag_display_names"
    slug: str = Field(primary_key=True)
    display_name: str
