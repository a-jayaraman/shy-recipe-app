"""
Tests for POST /api/v1/parse-recipe.

The endpoint calls OpenRouter (httpx) and resolves ingredient aliases via the DB.
All httpx calls are mocked so no real API key is needed.
"""
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_LLM_RESPONSE = {
    "title_clean": "Chana Masala",
    "ingredients": [
        {"amount": "2", "unit": "cups", "name": "chickpeas", "notes": "cooked"},
        {"amount": "1", "unit": "tsp", "name": "hing", "notes": ""},
        {"amount": "", "unit": "", "name": "garlic", "notes": "minced"},
    ],
    "instructions": [
        "Heat oil in a pan.",
        "Add spices and fry for one minute.",
        "Add chickpeas and simmer for 20 minutes.",
    ],
    "tags": {
        "title_clean": "Chana Masala",
        "cuisine": ["north indian"],
        "course": "main",
        "cooking_method": ["stovetop"],
        "difficulty": "medium",
        "total_time": "30-60-min",
        "serve_with": ["rice", "roti/chapati"],
        "dietary": ["vegan"],
        "key_ingredients": ["chickpeas", "garlic"],
        "notes": "",
    },
}


def _make_httpx_mock(response_body: dict | str, status_code: int = 200):
    """Build a mock httpx.AsyncClient whose .post() returns a fake response."""
    if isinstance(response_body, dict):
        raw_content = json.dumps(response_body)
    else:
        raw_content = response_body

    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": raw_content}}]
    }
    mock_resp.text = raw_content[:300]

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    return mock_client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_parse_recipe_happy_path(client: TestClient):
    """Valid text → structured response with alias resolution."""
    mock_client = _make_httpx_mock(VALID_LLM_RESPONSE)

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
         patch("app.routers.parse.httpx.AsyncClient", return_value=mock_client):
        resp = client.post("/api/v1/parse-recipe", json={"text": "Some recipe text here."})

    assert resp.status_code == 200
    data = resp.json()

    assert data["title"] == "Chana Masala"
    assert data["course"] == "main"
    assert data["difficulty"] == "medium"
    assert data["total_time"] == "30-60-min"
    assert "north indian" in data["cuisine"]
    assert "stovetop" in data["cooking_method"]
    assert "vegan" in data["dietary"]
    assert data["instructions"] == VALID_LLM_RESPONSE["instructions"]

    # Alias resolution: "hing" → "asafoetida" (alias seeded in conftest)
    names = [i["name"] for i in data["ingredients"]]
    assert "asafoetida" in names
    assert "hing" not in names

    # "garlic" resolves to itself (self-alias seeded in conftest)
    assert "garlic" in names

    # "chickpeas" has no alias, passes through unchanged
    assert "chickpeas" in names


def test_parse_recipe_markdown_fence_stripped(client: TestClient):
    """Model wraps output in ```json fences — should still parse."""
    fenced = f"```json\n{json.dumps(VALID_LLM_RESPONSE)}\n```"
    mock_client = _make_httpx_mock(fenced)

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
         patch("app.routers.parse.httpx.AsyncClient", return_value=mock_client):
        resp = client.post("/api/v1/parse-recipe", json={"text": "Some text."})

    assert resp.status_code == 200
    assert resp.json()["title"] == "Chana Masala"


def test_parse_recipe_missing_api_key_returns_503(client: TestClient):
    """If OPENROUTER_API_KEY is not set, endpoint returns 503."""
    env = {k: v for k, v in os.environ.items() if k != "OPENROUTER_API_KEY"}
    with patch.dict(os.environ, env, clear=True):
        resp = client.post("/api/v1/parse-recipe", json={"text": "Some text."})

    assert resp.status_code == 503
    assert "OPENROUTER_API_KEY" in resp.json()["detail"]


def test_parse_recipe_openrouter_error_returns_502(client: TestClient):
    """Non-200 from OpenRouter → 502."""
    mock_client = _make_httpx_mock("Internal Server Error", status_code=500)

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
         patch("app.routers.parse.httpx.AsyncClient", return_value=mock_client):
        resp = client.post("/api/v1/parse-recipe", json={"text": "Some text."})

    assert resp.status_code == 502


def test_parse_recipe_bad_json_from_llm_returns_422(client: TestClient):
    """LLM returns non-JSON → 422."""
    mock_client = _make_httpx_mock("Sorry, I cannot parse that recipe.")

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
         patch("app.routers.parse.httpx.AsyncClient", return_value=mock_client):
        resp = client.post("/api/v1/parse-recipe", json={"text": "Some text."})

    assert resp.status_code == 422


def test_parse_recipe_text_too_long_returns_422(client: TestClient):
    """Text exceeding 20,000 chars is rejected at validation."""
    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}):
        resp = client.post("/api/v1/parse-recipe", json={"text": "x" * 20_001})

    assert resp.status_code == 422


def test_parse_recipe_empty_text_rejected(client: TestClient):
    """Missing text field fails request validation."""
    resp = client.post("/api/v1/parse-recipe", json={})
    assert resp.status_code == 422


def test_parse_recipe_minimal_llm_response(client: TestClient):
    """Partial/sparse LLM output is handled gracefully (defaults to empty lists)."""
    sparse = {
        "title_clean": "Mystery Dish",
        "ingredients": [],
        "instructions": ["Cook it."],
        "tags": {
            "cuisine": [],
            "course": "main",
            "cooking_method": [],
            "difficulty": "easy",
            "total_time": "unknown",
            "serve_with": [],
            "dietary": [],
            "key_ingredients": [],
            "notes": "",
        },
    }
    mock_client = _make_httpx_mock(sparse)

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
         patch("app.routers.parse.httpx.AsyncClient", return_value=mock_client):
        resp = client.post("/api/v1/parse-recipe", json={"text": "Cook it."})

    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Mystery Dish"
    assert data["ingredients"] == []
    assert data["cuisine"] == []
