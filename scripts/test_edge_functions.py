"""
Integration tests for Supabase Edge Functions (recommend + parse-recipe).

Makes real HTTP calls against the deployed functions, including live LLM calls
via OpenRouter, so recommend tests take 10-30 s each.

Usage:
    pip install pytest requests
    SUPABASE_URL="https://<project>.supabase.co" \
    SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
    SUPABASE_ANON_KEY="<anon-key>" \
      pytest scripts/test_edge_functions.py -v
"""

import json
import os
import uuid

import pytest
import requests

# ---------------------------------------------------------------------------
# Config / skip guard
# ---------------------------------------------------------------------------

SUPABASE_URL      = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON_KEY          = os.environ.get("SUPABASE_ANON_KEY", "")

if not (SUPABASE_URL and SERVICE_ROLE_KEY and ANON_KEY):
    pytest.skip(
        "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY",
        allow_module_level=True,
    )

FUNCTIONS_URL = f"{SUPABASE_URL}/functions/v1"
ADMIN_HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}
ANON_HEADERS = {"apikey": ANON_KEY, "Content-Type": "application/json"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_user(email: str, password: str) -> str:
    """Create a Supabase user via admin API and return their user ID."""
    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=ADMIN_HEADERS,
        # user_metadata populates raw_user_meta_data in auth.users, which the
        # handle_new_user trigger reads to set profiles.email.
        json={"email": email, "password": password, "email_confirm": True,
              "user_metadata": {"email": email}},
    )
    assert resp.status_code == 200, f"create_user failed ({resp.status_code}): {resp.text[:300]}"
    return resp.json()["id"]


def _delete_user(user_id: str) -> None:
    requests.delete(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers=ADMIN_HEADERS,
    )


def _sign_in(email: str, password: str) -> str:
    """Sign in with email+password and return the access token."""
    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200, f"sign_in failed ({resp.status_code}): {resp.text[:300]}"
    return resp.json()["access_token"]


def _upsert_profile(user_id: str, email: str, role: str = "viewer") -> None:
    """Insert or update a profile row (handles trigger not firing for admin-created users)."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/profiles",
        headers={**ADMIN_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json={"id": user_id, "email": email, "role": role, "is_active": True},
    )
    assert resp.status_code in (200, 201, 204), f"upsert_profile failed: {resp.text[:300]}"


def _collect_sse(resp: requests.Response) -> list[dict]:
    """Consume a streaming SSE response and return all parsed event payloads."""
    events: list[dict] = []
    for chunk in resp.iter_content(chunk_size=None):
        for line in chunk.decode("utf-8").split("\n"):
            if line.startswith("data: "):
                try:
                    events.append(json.loads(line[6:]))
                except json.JSONDecodeError:
                    pass
    return events

# ---------------------------------------------------------------------------
# Fixtures — one viewer user, one editor user (created once per test session)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def viewer_token():
    email = f"test-viewer-{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPwd123!"
    user_id = _create_user(email, password)
    _upsert_profile(user_id, email, role="viewer")
    token = _sign_in(email, password)
    yield token
    _delete_user(user_id)


@pytest.fixture(scope="module")
def editor_token():
    email = f"test-editor-{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPwd123!"
    user_id = _create_user(email, password)
    _upsert_profile(user_id, email, role="editor")
    token = _sign_in(email, password)
    yield token
    _delete_user(user_id)

# ---------------------------------------------------------------------------
# recommend
# ---------------------------------------------------------------------------

MODEL = "~anthropic/claude-haiku-latest"


def _recommend(token: str | None, prompt: str, **kwargs) -> requests.Response:
    headers = dict(ANON_HEADERS)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(
        f"{FUNCTIONS_URL}/recommend",
        headers=headers,
        json={"messages": [{"role": "user", "content": prompt}], "model": MODEL},
        stream=True,
        **kwargs,
    )


class TestRecommend:
    def test_no_auth_returns_401(self):
        resp = requests.post(
            f"{FUNCTIONS_URL}/recommend",
            headers=ANON_HEADERS,
            json={"messages": [{"role": "user", "content": "test"}], "model": MODEL},
        )
        assert resp.status_code == 401

    def test_missing_model_returns_400(self, viewer_token):
        resp = requests.post(
            f"{FUNCTIONS_URL}/recommend",
            headers={**ANON_HEADERS, "Authorization": f"Bearer {viewer_token}"},
            json={"messages": [{"role": "user", "content": "test"}]},
        )
        assert resp.status_code == 400

    def test_returns_sse_stream(self, viewer_token):
        resp = _recommend(viewer_token, "Quick easy Indian dinner", timeout=90)
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("Content-Type", "")

        events = _collect_sse(resp)
        types = {e.get("type") for e in events}
        assert "done" in types, f"No 'done' event — got: {types}"
        # At least one text or tool event before done
        assert types & {"text_delta", "tool_call"}, f"No content events before done: {types}"

    def test_returns_recipe_ids(self, viewer_token):
        resp = _recommend(viewer_token, "Suggest a dal recipe", timeout=90)
        assert resp.status_code == 200

        events = _collect_sse(resp)
        id_events = [e for e in events if e.get("type") == "recipe_ids"]
        assert id_events, (
            "No recipe_ids event received. "
            f"Event types seen: {[e.get('type') for e in events]}. "
            "If the LLM responded but omitted the JSON block, redeploy the edge function "
            "with the updated code-fence-stripping regex."
        )

        ids = id_events[0]["ids"]
        assert isinstance(ids, list) and len(ids) > 0, "recipe_ids should be non-empty"
        assert all(isinstance(i, int) for i in ids), "All recipe IDs must be integers"

    def test_tool_calls_fire_for_search(self, viewer_token):
        resp = _recommend(viewer_token, "Something vegan and gluten free", timeout=90)
        assert resp.status_code == 200

        events = _collect_sse(resp)
        tool_events = [e for e in events if e.get("type") == "tool_call"]
        assert tool_events, "Expected at least one tool_call event"
        tool_names = {e["name"] for e in tool_events}
        assert tool_names & {"search_recipes", "list_available_filter_values"}, (
            f"Expected search_recipes or list_available_filter_values, got: {tool_names}"
        )

# ---------------------------------------------------------------------------
# parse-recipe
# ---------------------------------------------------------------------------

SAMPLE_RECIPE = """\
Masala Chai

Ingredients:
- 2 cups water
- 2 cups milk
- 2 tbsp black tea leaves
- 4 green cardamom pods, crushed
- 1 inch ginger, grated
- 2 tbsp sugar

Instructions:
1. Boil water with ginger and cardamom for 4 minutes.
2. Add tea and simmer 2 minutes.
3. Pour in milk and sugar, bring back to a boil.
4. Strain and serve hot.
"""


def _parse(token: str | None, text: str, **kwargs) -> requests.Response:
    headers = dict(ANON_HEADERS)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(
        f"{FUNCTIONS_URL}/parse-recipe",
        headers=headers,
        json={"text": text},
        **kwargs,
    )


class TestParseRecipe:
    def test_no_auth_returns_401(self):
        resp = _parse(None, SAMPLE_RECIPE)
        assert resp.status_code == 401

    def test_viewer_returns_403(self, viewer_token):
        resp = _parse(viewer_token, SAMPLE_RECIPE)
        assert resp.status_code == 403

    def test_empty_text_returns_400(self, editor_token):
        resp = _parse(editor_token, "")
        assert resp.status_code == 400

    def test_returns_structured_recipe(self, editor_token):
        resp = _parse(editor_token, SAMPLE_RECIPE, timeout=60)
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data.get("ingredients"), list) and len(data["ingredients"]) > 0
        assert isinstance(data.get("instructions"), list) and len(data["instructions"]) > 0
        assert isinstance(data.get("cuisine"), list)
        assert isinstance(data.get("dietary"), list)

        for ing in data["ingredients"]:
            assert "name" in ing and ing["name"], f"Ingredient missing name: {ing}"

    def test_alias_resolution(self, editor_token):
        """parse-recipe resolves ingredient aliases via the aliases table."""
        text = (
            "Dal Tadka\n\n"
            "Ingredients:\n- 1/4 tsp hing\n- 1 cup red lentils\n\n"
            "Instructions:\n1. Cook lentils until soft.\n2. Add hing in hot oil and pour over dal."
        )
        resp = _parse(editor_token, text, timeout=60)
        assert resp.status_code == 200

        names = [i["name"] for i in resp.json().get("ingredients", [])]
        # "hing" is an alias for "asafoetida" in the aliases table
        assert "asafoetida" in names, f"Expected 'asafoetida' (alias of 'hing') in: {names}"

# ---------------------------------------------------------------------------
# Recipe database CRUD
# ---------------------------------------------------------------------------

REST_URL = f"{SUPABASE_URL}/rest/v1"


def _rest_headers(prefer: str | None = None) -> dict:
    h = dict(ADMIN_HEADERS)
    if prefer:
        h["Prefer"] = prefer
    return h


class TestRecipeDatabase:
    """Integration tests for creating and deleting recipes directly via the REST API."""

    def test_create_and_delete_recipe(self):
        unique = uuid.uuid4().hex[:8]
        title = f"Test Recipe {unique}"

        # --- Create recipe row ---
        resp = requests.post(
            f"{REST_URL}/recipes",
            headers=_rest_headers("return=representation"),
            json={
                "title": title,
                "title_clean": title.lower(),
                "author": "Test Author",
                "servings": "2",
                "times_json": json.dumps({"prep": "5 min", "cook": "10 min"}),
                "course": "main",
                "difficulty": "easy",
                "total_time": "under-30-min",
                "notes": "Created by automated test",
            },
        )
        assert resp.status_code == 201, f"Create failed ({resp.status_code}): {resp.text[:300]}"
        recipe = resp.json()[0]
        recipe_id = recipe["id"]
        assert recipe["title"] == title

        # --- Add ingredients ---
        resp = requests.post(
            f"{REST_URL}/ingredients",
            headers=_rest_headers("return=minimal"),
            json=[
                {"recipe_id": recipe_id, "order_idx": 0, "amount": "1", "unit": "cup", "name": "water", "notes": None},
                {"recipe_id": recipe_id, "order_idx": 1, "amount": "2", "unit": "tbsp", "name": "sugar", "notes": None},
            ],
        )
        assert resp.status_code in (200, 201), f"Insert ingredients failed: {resp.text[:300]}"

        # --- Add instructions ---
        resp = requests.post(
            f"{REST_URL}/instructions",
            headers=_rest_headers("return=minimal"),
            json=[
                {"recipe_id": recipe_id, "order_idx": 0, "text": "Boil the water."},
                {"recipe_id": recipe_id, "order_idx": 1, "text": "Add sugar and stir."},
            ],
        )
        assert resp.status_code in (200, 201), f"Insert instructions failed: {resp.text[:300]}"

        # --- Verify recipe exists with related rows ---
        resp = requests.get(
            f"{REST_URL}/recipes",
            headers=ADMIN_HEADERS,
            params={
                "id": f"eq.{recipe_id}",
                "select": "id,title,ingredients(name),instructions(text)",
            },
        )
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1, "Recipe should exist after creation"
        assert rows[0]["title"] == title
        assert len(rows[0]["ingredients"]) == 2
        assert len(rows[0]["instructions"]) == 2

        # --- Delete recipe (cascades to ingredients/instructions via FK) ---
        resp = requests.delete(
            f"{REST_URL}/recipes",
            headers=_rest_headers("return=minimal"),
            params={"id": f"eq.{recipe_id}"},
        )
        assert resp.status_code in (200, 204), f"Delete failed ({resp.status_code}): {resp.text[:300]}"

        # --- Verify recipe is gone ---
        resp = requests.get(
            f"{REST_URL}/recipes",
            headers=ADMIN_HEADERS,
            params={"id": f"eq.{recipe_id}", "select": "id"},
        )
        assert resp.status_code == 200
        assert resp.json() == [], "Recipe should be gone after deletion"
