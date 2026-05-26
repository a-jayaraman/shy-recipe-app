import os
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import Index, event, text

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./recipes.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)


@event.listens_for(engine, "connect")
def enable_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_db_and_tables():
    # Import models to register them with SQLModel metadata before create_all
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _create_indexes()


def _create_indexes():
    from app.models import Recipe, Tag, RecipeTag, Ingredient

    indexes = [
        Index("ix_recipes_title_clean", Recipe.__table__.c.title_clean),
        Index("ix_recipes_course", Recipe.__table__.c.course),
        Index("ix_recipes_difficulty", Recipe.__table__.c.difficulty),
        Index("ix_recipes_total_time", Recipe.__table__.c.total_time),
        Index("ix_tags_category", Tag.__table__.c.category),
        Index("ix_tags_value", Tag.__table__.c.value),
        Index("ix_recipe_tags_recipe_id", RecipeTag.__table__.c.recipe_id),
        Index("ix_recipe_tags_tag_id", RecipeTag.__table__.c.tag_id),
        Index("ix_ingredients_recipe_id", Ingredient.__table__.c.recipe_id),
        Index("ix_ingredients_name", Ingredient.__table__.c.name),
    ]
    with engine.connect() as conn:
        for idx in indexes:
            try:
                idx.create(bind=conn, checkfirst=True)
            except Exception:
                pass
        conn.commit()


def get_session():
    with Session(engine) as session:
        yield session
