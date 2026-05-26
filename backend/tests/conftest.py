import os
import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy import event

# Provide required env vars before app imports so startup validation passes
os.environ.setdefault("SESSION_SECRET", "test-secret-key-for-tests-only-not-for-prod")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:8000/api/v1/auth/callback")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from app.main import app
from app.auth.csrf import require_csrf
from app.auth.session import create_session_token
from app.db import get_session
from app.models import (
    Recipe, Ingredient, Instruction, Tag, RecipeTag,
    IngredientAlias, TagDisplayName, User, UserRole,
)


@pytest.fixture(name="engine", scope="session")
def engine_fixture():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False})

    @event.listens_for(eng, "connect")
    def enable_fk(dbapi_conn, _):
        c = dbapi_conn.cursor()
        c.execute("PRAGMA foreign_keys=ON")
        c.close()

    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture(name="session")
def session_fixture(engine):
    """Per-test session with rollback isolation."""
    connection = engine.connect()
    transaction = connection.begin()
    sess = Session(bind=connection)
    yield sess
    sess.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(name="seeded_session")
def seeded_session_fixture(session: Session):
    """Session with minimal test data."""
    # Tags
    t_italian = Tag(id=1, category="cuisine", value="italian")
    t_north_indian = Tag(id=2, category="cuisine", value="north indian")
    t_ip = Tag(id=3, category="cooking_method", value="instant-pot")
    t_stovetop = Tag(id=4, category="cooking_method", value="stovetop")
    t_standalone = Tag(id=5, category="serve_with", value="standalone")
    t_dairy = Tag(id=6, category="dietary", value="contains-dairy")
    t_vegan = Tag(id=7, category="dietary", value="vegan")
    t_ki_garlic = Tag(id=8, category="key_ingredient", value="garlic")
    t_ki_paneer = Tag(id=9, category="key_ingredient", value="paneer")
    t_ki_lentils = Tag(id=10, category="key_ingredient", value="lentils")

    for t in [t_italian, t_north_indian, t_ip, t_stovetop, t_standalone,
              t_dairy, t_vegan, t_ki_garlic, t_ki_paneer, t_ki_lentils]:
        session.add(t)
    session.flush()

    # Recipes
    r1 = Recipe(
        id=1, title="Pasta", title_clean="Pasta (Instant Pot)",
        course="main", difficulty="easy", total_time="under-30-min",
        published=date(2022, 1, 1),
    )
    r2 = Recipe(
        id=2, title="Dal Tadka", title_clean="Dal Tadka",
        course="main", difficulty="medium", total_time="30-60-min",
        published=date(2021, 6, 15),
    )
    r3 = Recipe(
        id=3, title="Paneer Curry", title_clean="Paneer Curry",
        course="main", difficulty="easy", total_time="30-60-min",
        published=date(2023, 3, 10),
    )
    for r in [r1, r2, r3]:
        session.add(r)
    session.flush()

    # Ingredients
    session.add(Ingredient(id=1, recipe_id=1, order_idx=0, name="garlic"))
    session.add(Ingredient(id=2, recipe_id=1, order_idx=1, name="bell pepper"))
    session.add(Ingredient(id=3, recipe_id=2, order_idx=0, name="lentils"))
    session.add(Ingredient(id=4, recipe_id=3, order_idx=0, name="paneer"))
    session.add(Ingredient(id=5, recipe_id=3, order_idx=1, name="garlic"))
    session.flush()

    # Instructions
    session.add(Instruction(id=1, recipe_id=1, order_idx=0, text="Cook pasta."))
    session.add(Instruction(id=2, recipe_id=1, order_idx=1, text="Add sauce."))
    session.add(Instruction(id=3, recipe_id=2, order_idx=0, text="Cook dal."))
    session.flush()

    # RecipeTags
    for rt in [
        RecipeTag(recipe_id=1, tag_id=t_italian.id),
        RecipeTag(recipe_id=1, tag_id=t_ip.id),
        RecipeTag(recipe_id=1, tag_id=t_standalone.id),
        RecipeTag(recipe_id=1, tag_id=t_dairy.id),
        RecipeTag(recipe_id=1, tag_id=t_ki_garlic.id),
        RecipeTag(recipe_id=2, tag_id=t_north_indian.id),
        RecipeTag(recipe_id=2, tag_id=t_stovetop.id),
        RecipeTag(recipe_id=2, tag_id=t_vegan.id),
        RecipeTag(recipe_id=2, tag_id=t_ki_lentils.id),
        RecipeTag(recipe_id=3, tag_id=t_north_indian.id),
        RecipeTag(recipe_id=3, tag_id=t_ip.id),
        RecipeTag(recipe_id=3, tag_id=t_dairy.id),
        RecipeTag(recipe_id=3, tag_id=t_ki_paneer.id),
        RecipeTag(recipe_id=3, tag_id=t_ki_garlic.id),
    ]:
        session.add(rt)
    session.flush()

    # Aliases
    session.add(IngredientAlias(alias="capsicum", canonical="bell pepper"))
    session.add(IngredientAlias(alias="hing", canonical="asafoetida"))
    session.add(IngredientAlias(alias="garlic", canonical="garlic"))
    session.add(IngredientAlias(alias="bell pepper", canonical="bell pepper"))
    session.flush()

    # Display names
    session.add(TagDisplayName(slug="instant-pot", display_name="Instant Pot"))
    session.add(TagDisplayName(slug="north indian", display_name="North Indian"))
    session.add(TagDisplayName(slug="contains-dairy", display_name="Contains Dairy"))
    session.add(TagDisplayName(slug="italian", display_name="Italian"))
    session.flush()

    session.commit()
    return session


@pytest.fixture(name="client")
def client_fixture(seeded_session: Session):
    # Create a test editor user so require_role checks pass
    test_user = User(
        id=999,
        google_sub="test_sub_editor",
        email="editor@test.com",
        name="Test Editor",
        role=UserRole.editor.value,
        is_active=True,
    )
    seeded_session.add(test_user)
    seeded_session.flush()

    session_token = create_session_token(test_user.id, test_user.role)

    def override_get_session():
        yield seeded_session

    async def no_csrf():
        pass

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[require_csrf] = no_csrf

    with TestClient(app) as c:
        c.cookies.set("session", session_token)
        yield c

    app.dependency_overrides.clear()
