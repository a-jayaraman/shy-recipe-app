import pytest
from fastapi.testclient import TestClient


def test_get_tags_by_cuisine(client: TestClient):
    resp = client.get("/api/v1/tags/cuisine")
    assert resp.status_code == 200
    data = resp.json()
    assert data["category"] == "cuisine"
    values = {v["value"]: v for v in data["values"]}
    assert "italian" in values
    assert "north indian" in values
    assert values["italian"]["count"] == 1
    assert values["north indian"]["count"] == 2  # r2 and r3


def test_get_tags_includes_display_name(client: TestClient):
    resp = client.get("/api/v1/tags/cooking_method")
    assert resp.status_code == 200
    values = {v["value"]: v for v in resp.json()["values"]}
    assert values["instant-pot"]["display_name"] == "Instant Pot"


def test_get_tags_display_name_fallback(client: TestClient):
    resp = client.get("/api/v1/tags/cooking_method")
    assert resp.status_code == 200
    values = {v["value"]: v for v in resp.json()["values"]}
    # "stovetop" has no entry in TagDisplayName fixture
    assert values["stovetop"]["display_name"] == "Stovetop"


def test_get_tags_invalid_category(client: TestClient):
    resp = client.get("/api/v1/tags/nonsense")
    assert resp.status_code == 422


def test_get_all_tags(client: TestClient):
    resp = client.get("/api/v1/tags")
    assert resp.status_code == 200
    cats = resp.json()["categories"]
    assert set(cats.keys()) == {"cuisine", "cooking_method", "serve_with", "dietary", "key_ingredient"}


def test_get_key_ingredient_tags(client: TestClient):
    resp = client.get("/api/v1/tags/key_ingredient")
    assert resp.status_code == 200
    values = {v["value"] for v in resp.json()["values"]}
    assert "garlic" in values
    assert "paneer" in values
    assert "lentils" in values


def test_get_ingredient_aliases(client: TestClient):
    resp = client.get("/api/v1/aliases/ingredients")
    assert resp.status_code == 200
    data = resp.json()
    assert data["capsicum"] == "bell pepper"
    assert data["hing"] == "asafoetida"
    assert data["garlic"] == "garlic"


def test_get_tag_display_names(client: TestClient):
    resp = client.get("/api/v1/aliases/tags")
    assert resp.status_code == 200
    data = resp.json()
    assert data["instant-pot"] == "Instant Pot"
    assert data["north indian"] == "North Indian"
    assert data["contains-dairy"] == "Contains Dairy"


def test_stats_endpoint(client: TestClient):
    resp = client.get("/api/v1/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["recipe_count"] == 3
    assert data["ingredient_alias_count"] == 4
    assert data["tag_display_name_count"] == 4
