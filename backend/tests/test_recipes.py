import pytest
from fastapi.testclient import TestClient


def test_get_recipe_by_id(client: TestClient):
    resp = client.get("/api/v1/recipes/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == 1
    assert data["title_clean"] == "Pasta (Instant Pot)"
    assert data["course"] == "main"
    assert "Italian" not in data["cuisine"]  # stored as slug "italian"
    assert "italian" in data["cuisine"]


def test_get_recipe_returns_ingredients_ordered(client: TestClient):
    resp = client.get("/api/v1/recipes/1")
    assert resp.status_code == 200
    ings = resp.json()["ingredients"]
    assert len(ings) == 2
    assert ings[0]["name"] == "garlic"
    assert ings[1]["name"] == "bell pepper"
    assert ings[0]["order_idx"] == 0
    assert ings[1]["order_idx"] == 1


def test_get_recipe_returns_instructions_ordered(client: TestClient):
    resp = client.get("/api/v1/recipes/1")
    assert resp.status_code == 200
    instructions = resp.json()["instructions"]
    assert instructions == ["Cook pasta.", "Add sauce."]


def test_get_recipe_no_instructions(client: TestClient):
    resp = client.get("/api/v1/recipes/3")
    assert resp.status_code == 200
    assert resp.json()["instructions"] == []


def test_get_recipe_not_found(client: TestClient):
    resp = client.get("/api/v1/recipes/9999")
    assert resp.status_code == 404


def test_create_recipe(client: TestClient):
    payload = {
        "title": "New Recipe",
        "title_clean": "New Recipe",
        "course": "side",
        "difficulty": "easy",
        "total_time": "under-30-min",
        "cuisine": ["italian"],
        "ingredients": [{"name": "salt", "amount": "1", "unit": "tsp"}],
        "instructions": ["Add salt."],
    }
    resp = client.post("/api/v1/recipes", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title_clean"] == "New Recipe"
    assert data["course"] == "side"
    assert data["ingredients"][0]["name"] == "salt"
    assert data["instructions"] == ["Add salt."]
    new_id = data["id"]

    # Verify it's retrievable
    resp2 = client.get(f"/api/v1/recipes/{new_id}")
    assert resp2.status_code == 200
    assert resp2.json()["title_clean"] == "New Recipe"


def test_create_recipe_invalid_course_returns_422(client: TestClient):
    payload = {"title": "X", "title_clean": "X", "course": "snacks"}
    resp = client.post("/api/v1/recipes", json=payload)
    assert resp.status_code == 422


def test_create_recipe_invalid_difficulty_returns_422(client: TestClient):
    payload = {"title": "X", "title_clean": "X", "difficulty": "trivial"}
    resp = client.post("/api/v1/recipes", json=payload)
    assert resp.status_code == 422


def test_create_recipe_invalid_total_time_returns_422(client: TestClient):
    payload = {"title": "X", "title_clean": "X", "total_time": "quick"}
    resp = client.post("/api/v1/recipes", json=payload)
    assert resp.status_code == 422


def test_update_recipe_full_replace(client: TestClient):
    payload = {
        "title": "Updated Pasta",
        "title_clean": "Updated Pasta",
        "course": "main",
        "difficulty": "hard",
        "total_time": "1-2-hrs",
        "ingredients": [{"name": "egg", "amount": "2"}],
        "instructions": ["Boil egg."],
    }
    resp = client.put("/api/v1/recipes/1", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["title_clean"] == "Updated Pasta"
    assert data["difficulty"] == "hard"
    assert len(data["ingredients"]) == 1
    assert data["ingredients"][0]["name"] == "egg"


def test_update_recipe_not_found(client: TestClient):
    payload = {"title": "X", "title_clean": "X"}
    resp = client.put("/api/v1/recipes/9999", json=payload)
    assert resp.status_code == 404


def test_patch_recipe_partial(client: TestClient):
    resp = client.patch("/api/v1/recipes/2", json={"difficulty": "easy"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["difficulty"] == "easy"
    assert data["title_clean"] == "Dal Tadka"  # unchanged


def test_patch_recipe_not_found(client: TestClient):
    resp = client.patch("/api/v1/recipes/9999", json={"difficulty": "easy"})
    assert resp.status_code == 404


def test_delete_recipe(client: TestClient):
    resp = client.delete("/api/v1/recipes/1")
    assert resp.status_code == 204

    resp2 = client.get("/api/v1/recipes/1")
    assert resp2.status_code == 404


def test_delete_recipe_cascades_ingredients(client: TestClient, seeded_session):
    from sqlmodel import select
    from app.models import Ingredient
    client.delete("/api/v1/recipes/1")
    ings = seeded_session.exec(
        select(Ingredient).where(Ingredient.recipe_id == 1)
    ).all()
    assert len(ings) == 0


def test_delete_recipe_not_found(client: TestClient):
    resp = client.delete("/api/v1/recipes/9999")
    assert resp.status_code == 404


def test_new_tag_value_adds_warning(client: TestClient):
    payload = {
        "title": "New",
        "title_clean": "New",
        "cuisine": ["polynesian"],  # not in existing tags
    }
    resp = client.post("/api/v1/recipes", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert any("polynesian" in w for w in data["warnings"])
