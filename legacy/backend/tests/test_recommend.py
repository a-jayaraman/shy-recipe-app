"""
Tests for Module 4 — recommendation endpoint, validate-model endpoint, tool layer,
and orchestrator.

Sections:
  1. Helpers
  2. Tool layer  (direct function tests, seeded DB session)
  3. Validate-model endpoint  (HTTP, mocked httpx GET /models)
  4. Recommend SSE endpoint   (HTTP, mocked orchestrator)
  5. Orchestrator unit tests  (async, mocked httpx streaming)
"""
import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.llm.tools import execute_tool, _search_recipes, _get_recipe, _list_filter_values
from app.llm.orchestrator import run_recommendation_stream


# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_sse_events(text: str) -> list[dict]:
    """Parse a raw SSE response body into a list of decoded event dicts."""
    events = []
    for line in text.split("\n"):
        line = line.strip()
        if line.startswith("data: "):
            try:
                events.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass
    return events


def _make_models_mock(model_ids: list[str], status_code: int = 200):
    """Mock for httpx.AsyncClient used by the validate-model endpoint (GET /models)."""
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = {
        "data": [{"id": mid, "name": f"Model ({mid})"} for mid in model_ids]
    }
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


def _make_stream_cm(chunks: list[str], status_code: int = 200):
    """Async context-manager mock for httpx.AsyncClient.stream() that yields given chunks."""
    async def _aiter_text():
        for chunk in chunks:
            yield chunk

    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.aread = AsyncMock(return_value=b"upstream error body")
    mock_resp.aiter_text = lambda: _aiter_text()

    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=mock_resp)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _text_sse_chunks(content: str) -> list[str]:
    """Build minimal OpenRouter-style SSE chunks for a plain text (stop) response."""
    delta_event = json.dumps({
        "choices": [{"delta": {"content": content}, "finish_reason": None}]
    })
    stop_event = json.dumps({
        "choices": [{"delta": {}, "finish_reason": "stop"}]
    })
    return [
        f"data: {delta_event}\n\n",
        f"data: {stop_event}\n\n",
        "data: [DONE]\n\n",
    ]


def _tool_call_sse_chunks(call_id: str, fn_name: str, fn_args: dict) -> list[str]:
    """Build OpenRouter-style SSE chunks for a tool-call response (finish_reason=tool_calls)."""
    args_str = json.dumps(fn_args)
    first = json.dumps({
        "choices": [{
            "delta": {
                "tool_calls": [{
                    "index": 0,
                    "id": call_id,
                    "type": "function",
                    "function": {"name": fn_name, "arguments": ""},
                }]
            },
            "finish_reason": None,
        }]
    })
    args_delta = json.dumps({
        "choices": [{
            "delta": {
                "tool_calls": [{"index": 0, "function": {"arguments": args_str}}]
            },
            "finish_reason": None,
        }]
    })
    finish = json.dumps({
        "choices": [{"delta": {}, "finish_reason": "tool_calls"}]
    })
    return [
        f"data: {first}\n\n",
        f"data: {args_delta}\n\n",
        f"data: {finish}\n\n",
        "data: [DONE]\n\n",
    ]


def _run_async(coro):
    """Run an awaitable synchronously (for use in synchronous pytest tests)."""
    return asyncio.run(coro)


# ── 1. Tool layer ─────────────────────────────────────────────────────────────

class TestSearchRecipes:
    def test_cuisine_filter_returns_matching_recipes(self, seeded_session):
        result = json.loads(_search_recipes({"cuisine": ["north indian"]}, seeded_session))
        ids = {r["id"] for r in result["results"]}
        assert ids == {2, 3}  # Dal Tadka + Paneer Curry

    def test_difficulty_filter(self, seeded_session):
        result = json.loads(_search_recipes({"difficulty": "easy"}, seeded_session))
        ids = {r["id"] for r in result["results"]}
        assert ids == {1, 3}

    def test_total_returns_unfiltered_count(self, seeded_session):
        result = json.loads(_search_recipes({"cuisine": ["italian"], "limit": 1}, seeded_session))
        assert result["total"] == 1
        assert len(result["results"]) == 1

    def test_empty_filters_returns_all(self, seeded_session):
        result = json.loads(_search_recipes({}, seeded_session))
        assert result["total"] == 3

    def test_limit_capped_at_20(self, seeded_session):
        # limit arg is capped to 20 by the tool, not unlimited
        result = json.loads(_search_recipes({"limit": 100}, seeded_session))
        # 3 seeded recipes, all returned — cap only clips if total > 20
        assert len(result["results"]) == 3

    def test_result_includes_tag_fields(self, seeded_session):
        result = json.loads(_search_recipes({"cuisine": ["italian"]}, seeded_session))
        r = result["results"][0]
        assert "cuisine" in r
        assert "key_ingredients" in r
        assert "serve_with" in r
        assert "dietary" in r
        assert "italian" in r["cuisine"]

    def test_key_ingredient_alias_resolution(self, seeded_session):
        # "capsicum" is seeded as alias for "bell pepper".
        # No recipe has key_ingredient tag "bell pepper" in seeded data → 0 results.
        result = json.loads(_search_recipes({"key_ingredient": ["capsicum"]}, seeded_session))
        assert result["total"] == 0

    def test_has_ingredient_alias_resolution(self, seeded_session):
        # "capsicum" alias resolves to "bell pepper"; recipe 1 (Pasta) has bell pepper ingredient.
        result = json.loads(_search_recipes({"has_ingredient": ["capsicum"]}, seeded_session))
        ids = {r["id"] for r in result["results"]}
        assert 1 in ids

    def test_has_ingredient_partial_match(self, seeded_session):
        # "garlic" matches ingredient name in recipes 1 and 3
        result = json.loads(_search_recipes({"has_ingredient": ["garlic"]}, seeded_session))
        ids = {r["id"] for r in result["results"]}
        assert ids == {1, 3}

    def test_key_ingredient_and_semantics(self, seeded_session):
        # recipe 3 has both paneer AND garlic as key_ingredient tags → returned
        # recipe 1 has garlic but not paneer → not returned
        result = json.loads(_search_recipes(
            {"key_ingredient": ["garlic", "paneer"]}, seeded_session
        ))
        ids = {r["id"] for r in result["results"]}
        assert ids == {3}

    def test_nonexistent_cuisine_returns_empty(self, seeded_session):
        result = json.loads(_search_recipes({"cuisine": ["korean"]}, seeded_session))
        assert result["total"] == 0
        assert result["results"] == []


class TestGetRecipe:
    def test_found_returns_full_detail(self, seeded_session):
        result = json.loads(_get_recipe({"id": 1}, seeded_session))
        assert result["id"] == 1
        assert result["title"] == "Pasta (Instant Pot)"
        assert len(result["ingredients"]) == 2
        assert len(result["instructions"]) == 2
        assert "italian" in result["cuisine"]

    def test_includes_key_ingredients_tags(self, seeded_session):
        result = json.loads(_get_recipe({"id": 3}, seeded_session))
        assert "paneer" in result["key_ingredients"]
        assert "garlic" in result["key_ingredients"]

    def test_not_found_returns_error_json(self, seeded_session):
        result = json.loads(_get_recipe({"id": 9999}, seeded_session))
        assert "error" in result
        assert "9999" in result["error"]

    def test_ingredient_structure(self, seeded_session):
        result = json.loads(_get_recipe({"id": 1}, seeded_session))
        ing = result["ingredients"][0]
        assert "name" in ing
        assert "amount" in ing
        assert "unit" in ing
        assert "notes" in ing


class TestListFilterValues:
    def test_cuisine_returns_value_and_count(self, seeded_session):
        result = json.loads(_list_filter_values({"category": "cuisine"}, seeded_session))
        assert result["category"] == "cuisine"
        values = {v["value"] for v in result["values"]}
        assert "italian" in values
        assert "north indian" in values

    def test_non_key_ingredient_has_no_aliases_key(self, seeded_session):
        result = json.loads(_list_filter_values({"category": "cuisine"}, seeded_session))
        for entry in result["values"]:
            assert "canonical" not in entry
            assert "value" in entry

    def test_key_ingredient_has_canonical_and_aliases(self, seeded_session):
        result = json.loads(_list_filter_values({"category": "key_ingredient"}, seeded_session))
        assert result["category"] == "key_ingredient"
        for entry in result["values"]:
            assert "canonical" in entry
            assert "aliases" in entry
            assert isinstance(entry["aliases"], list)
            assert "count" in entry

    def test_key_ingredient_alias_values_populated(self, seeded_session):
        # "garlic" → "garlic" alias is seeded; "bell pepper" → "bell pepper" alias is seeded
        result = json.loads(_list_filter_values({"category": "key_ingredient"}, seeded_session))
        garlic_entry = next(
            (v for v in result["values"] if v["canonical"] == "garlic"), None
        )
        assert garlic_entry is not None
        assert "garlic" in garlic_entry["aliases"]

    def test_key_ingredient_count_reflects_recipes(self, seeded_session):
        # garlic is a key_ingredient tag on recipes 1 and 3 → count == 2
        result = json.loads(_list_filter_values({"category": "key_ingredient"}, seeded_session))
        garlic_entry = next(v for v in result["values"] if v["canonical"] == "garlic")
        assert garlic_entry["count"] == 2


class TestExecuteToolDispatch:
    def test_search_recipes(self, seeded_session):
        result = json.loads(_run_async(
            execute_tool("search_recipes", {"cuisine": ["italian"]}, seeded_session)
        ))
        assert result["total"] == 1
        assert result["results"][0]["id"] == 1

    def test_get_recipe(self, seeded_session):
        result = json.loads(_run_async(
            execute_tool("get_recipe", {"id": 2}, seeded_session)
        ))
        assert result["id"] == 2
        assert "Dal Tadka" in result["title"]

    def test_list_available_filter_values(self, seeded_session):
        result = json.loads(_run_async(
            execute_tool(
                "list_available_filter_values", {"category": "cuisine"}, seeded_session
            )
        ))
        assert result["category"] == "cuisine"

    def test_unknown_tool_returns_error_json(self, seeded_session):
        result = json.loads(_run_async(
            execute_tool("no_such_tool", {}, seeded_session)
        ))
        assert "error" in result


# ── 2. Validate-model endpoint ────────────────────────────────────────────────

class TestValidateModelEndpoint:
    def test_valid_model_returns_true(self, client: TestClient):
        mock_http = _make_models_mock(["google/gemma-4-31b-it:free", "openai/gpt-4o"])
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
             patch("app.routers.recommend.httpx.AsyncClient", return_value=mock_http):
            resp = client.get(
                "/api/v1/recommend/validate-model",
                params={"model_id": "google/gemma-4-31b-it:free"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["display_name"] is not None

    def test_tilde_prefix_stripped_for_lookup(self, client: TestClient):
        # ~anthropic/claude-haiku-latest → looks up "anthropic/claude-haiku-latest"
        mock_http = _make_models_mock(["anthropic/claude-haiku-latest"])
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
             patch("app.routers.recommend.httpx.AsyncClient", return_value=mock_http):
            resp = client.get(
                "/api/v1/recommend/validate-model",
                params={"model_id": "~anthropic/claude-haiku-latest"},
            )
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

    def test_model_exact_match_with_tilde(self, client: TestClient):
        # If the ~ model ID itself appears in the list, it's also valid
        mock_http = _make_models_mock(["~anthropic/claude-haiku-latest"])
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
             patch("app.routers.recommend.httpx.AsyncClient", return_value=mock_http):
            resp = client.get(
                "/api/v1/recommend/validate-model",
                params={"model_id": "~anthropic/claude-haiku-latest"},
            )
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

    def test_model_not_in_list_returns_invalid(self, client: TestClient):
        mock_http = _make_models_mock(["openai/gpt-4o", "anthropic/claude-3-haiku"])
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
             patch("app.routers.recommend.httpx.AsyncClient", return_value=mock_http):
            resp = client.get(
                "/api/v1/recommend/validate-model",
                params={"model_id": "made-up/nonexistent-model"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert data["display_name"] is None

    def test_missing_api_key_returns_503(self, client: TestClient):
        env = {k: v for k, v in os.environ.items() if k != "OPENROUTER_API_KEY"}
        with patch.dict(os.environ, env, clear=True):
            resp = client.get(
                "/api/v1/recommend/validate-model",
                params={"model_id": "some/model"},
            )
        assert resp.status_code == 503
        assert "OPENROUTER_API_KEY" in resp.json()["detail"]

    def test_openrouter_non_200_returns_502(self, client: TestClient):
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
             patch("app.routers.recommend.httpx.AsyncClient", return_value=mock_client):
            resp = client.get(
                "/api/v1/recommend/validate-model",
                params={"model_id": "some/model"},
            )
        assert resp.status_code == 502

    def test_network_error_returns_502(self, client: TestClient):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(
            side_effect=httpx.RequestError("connection refused", request=MagicMock())
        )
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
             patch("app.routers.recommend.httpx.AsyncClient", return_value=mock_client):
            resp = client.get(
                "/api/v1/recommend/validate-model",
                params={"model_id": "some/model"},
            )
        assert resp.status_code == 502

    def test_missing_model_id_param_returns_422(self, client: TestClient):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}):
            resp = client.get("/api/v1/recommend/validate-model")
        assert resp.status_code == 422


# ── 3. Recommend SSE endpoint ─────────────────────────────────────────────────

class TestRecommendEndpoint:
    @staticmethod
    def _fake_stream(*events_to_yield: dict):
        """Return an async generator function that yields the given event dicts as SSE."""
        async def _fake(messages, model, session):
            for event in events_to_yield:
                yield f"data: {json.dumps(event)}\n\n"
        return _fake

    def test_returns_text_event_stream_content_type(self, client: TestClient):
        fake = self._fake_stream({"type": "done"})
        with patch("app.routers.recommend.run_recommendation_stream", new=fake):
            resp = client.post(
                "/api/v1/recommend",
                json={"messages": [{"role": "user", "content": "test"}]},
            )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]

    def test_events_forwarded_in_order(self, client: TestClient):
        fake = self._fake_stream(
            {"type": "text_delta", "delta": "Great choice!"},
            {"type": "recipe_ids", "ids": [1, 2]},
            {"type": "done"},
        )
        with patch("app.routers.recommend.run_recommendation_stream", new=fake):
            resp = client.post(
                "/api/v1/recommend",
                json={"messages": [{"role": "user", "content": "test"}]},
            )
        events = parse_sse_events(resp.text)
        assert len(events) == 3
        assert events[0] == {"type": "text_delta", "delta": "Great choice!"}
        assert events[1] == {"type": "recipe_ids", "ids": [1, 2]}
        assert events[2] == {"type": "done"}

    def test_default_model_passed_to_orchestrator(self, client: TestClient):
        captured: list[str] = []

        async def _capture(messages, model, session):
            captured.append(model)
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        with patch("app.routers.recommend.run_recommendation_stream", new=_capture):
            client.post(
                "/api/v1/recommend",
                json={"messages": [{"role": "user", "content": "test"}]},
            )
        assert captured == ["~anthropic/claude-haiku-latest"]

    def test_custom_model_forwarded_to_orchestrator(self, client: TestClient):
        captured: list[str] = []

        async def _capture(messages, model, session):
            captured.append(model)
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        with patch("app.routers.recommend.run_recommendation_stream", new=_capture):
            client.post(
                "/api/v1/recommend",
                json={
                    "messages": [{"role": "user", "content": "test"}],
                    "model": "google/gemma-4-31b-it:free",
                },
            )
        assert captured == ["google/gemma-4-31b-it:free"]

    def test_full_message_history_forwarded(self, client: TestClient):
        captured: list[list] = []

        async def _capture(messages, model, session):
            captured.append(list(messages))
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        msgs = [
            {"role": "user", "content": "Quick dinner ideas"},
            {"role": "assistant", "content": "Here are some options."},
            {"role": "user", "content": "Make it vegan"},
        ]
        with patch("app.routers.recommend.run_recommendation_stream", new=_capture):
            client.post("/api/v1/recommend", json={"messages": msgs})

        assert len(captured[0]) == 3
        assert captured[0][2]["content"] == "Make it vegan"

    def test_error_event_forwarded(self, client: TestClient):
        fake = self._fake_stream(
            {"type": "error", "message": "Something broke"},
        )
        with patch("app.routers.recommend.run_recommendation_stream", new=fake):
            resp = client.post(
                "/api/v1/recommend",
                json={"messages": [{"role": "user", "content": "test"}]},
            )
        events = parse_sse_events(resp.text)
        assert events[0]["type"] == "error"
        assert "Something broke" in events[0]["message"]

    def test_invalid_request_body_returns_422(self, client: TestClient):
        # messages field is required
        resp = client.post("/api/v1/recommend", json={})
        assert resp.status_code == 422

    def test_missing_api_key_yields_error_event(self, client: TestClient):
        # Do NOT mock the orchestrator — let it run and detect the missing key
        env = {k: v for k, v in os.environ.items() if k != "OPENROUTER_API_KEY"}
        with patch.dict(os.environ, env, clear=True):
            resp = client.post(
                "/api/v1/recommend",
                json={"messages": [{"role": "user", "content": "test"}]},
            )
        assert resp.status_code == 200  # SSE always 200
        events = parse_sse_events(resp.text)
        assert events[0]["type"] == "error"
        assert "OPENROUTER_API_KEY" in events[0]["message"]


# ── 4. Orchestrator unit tests ────────────────────────────────────────────────

class TestOrchestrator:
    def test_missing_api_key_yields_single_error_event(self, seeded_session):
        async def run():
            events = []
            env = {k: v for k, v in os.environ.items() if k != "OPENROUTER_API_KEY"}
            with patch.dict(os.environ, env, clear=True):
                async for raw in run_recommendation_stream(
                    [{"role": "user", "content": "test"}],
                    "some-model",
                    seeded_session,
                ):
                    events.append(json.loads(raw[6:]))  # strip "data: "
            return events

        events = _run_async(run())
        assert len(events) == 1
        assert events[0]["type"] == "error"
        assert "OPENROUTER_API_KEY" in events[0]["message"]

    def test_text_response_yields_deltas_and_done(self, seeded_session):
        text = 'Try Pasta! {"recipe_ids": [1]}'
        chunks = _text_sse_chunks(text)

        async def run():
            events = []
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.stream = MagicMock(return_value=_make_stream_cm(chunks))
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
                 patch("app.llm.orchestrator.httpx.AsyncClient", return_value=mock_client):
                async for raw in run_recommendation_stream(
                    [{"role": "user", "content": "quick dinner?"}],
                    "test-model",
                    seeded_session,
                ):
                    events.append(json.loads(raw[6:]))
            return events

        events = _run_async(run())
        types = [e["type"] for e in events]
        assert "text_delta" in types
        assert "recipe_ids" in types
        assert types[-1] == "done"

        ids_event = next(e for e in events if e["type"] == "recipe_ids")
        assert ids_event["ids"] == [1]

    def test_text_response_without_recipe_ids_block(self, seeded_session):
        """If the LLM omits the recipe_ids JSON, no recipe_ids event is emitted."""
        chunks = _text_sse_chunks("I don't have any matching recipes in the collection.")

        async def run():
            events = []
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.stream = MagicMock(return_value=_make_stream_cm(chunks))
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
                 patch("app.llm.orchestrator.httpx.AsyncClient", return_value=mock_client):
                async for raw in run_recommendation_stream(
                    [{"role": "user", "content": "Korean BBQ?"}],
                    "test-model",
                    seeded_session,
                ):
                    events.append(json.loads(raw[6:]))
            return events

        events = _run_async(run())
        types = [e["type"] for e in events]
        assert "recipe_ids" not in types
        assert "done" in types

    def test_non_200_from_openrouter_yields_error(self, seeded_session):
        async def run():
            events = []
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.stream = MagicMock(
                return_value=_make_stream_cm([], status_code=502)
            )
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
                 patch("app.llm.orchestrator.httpx.AsyncClient", return_value=mock_client):
                async for raw in run_recommendation_stream(
                    [{"role": "user", "content": "test"}],
                    "test-model",
                    seeded_session,
                ):
                    events.append(json.loads(raw[6:]))
            return events

        events = _run_async(run())
        assert events[0]["type"] == "error"
        assert "502" in events[0]["message"]

    def test_network_error_yields_error_event(self, seeded_session):
        async def run():
            events = []
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.stream = MagicMock(
                side_effect=httpx.RequestError("refused", request=MagicMock())
            )
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
                 patch("app.llm.orchestrator.httpx.AsyncClient", return_value=mock_client):
                async for raw in run_recommendation_stream(
                    [{"role": "user", "content": "test"}],
                    "test-model",
                    seeded_session,
                ):
                    events.append(json.loads(raw[6:]))
            return events

        events = _run_async(run())
        assert events[0]["type"] == "error"
        assert "Request failed" in events[0]["message"]

    def test_tool_call_round_then_text_response(self, seeded_session):
        """A tool-calls round followed by a stop round executes the tool and streams final text."""
        round1 = _tool_call_sse_chunks("call_1", "search_recipes", {"cuisine": ["italian"]})
        round2 = _text_sse_chunks('Pasta looks great! {"recipe_ids": [1]}')

        async def run():
            events = []
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.stream = MagicMock(side_effect=[
                _make_stream_cm(round1),
                _make_stream_cm(round2),
            ])
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
                 patch("app.llm.orchestrator.httpx.AsyncClient", return_value=mock_client):
                async for raw in run_recommendation_stream(
                    [{"role": "user", "content": "Italian dinner?"}],
                    "test-model",
                    seeded_session,
                ):
                    events.append(json.loads(raw[6:]))
            return events, mock_client

        events, mock_client = _run_async(run())
        types = [e["type"] for e in events]

        # Tool call event emitted
        assert "tool_call" in types
        tc_event = next(e for e in events if e["type"] == "tool_call")
        assert tc_event["name"] == "search_recipes"
        assert tc_event["args"] == {"cuisine": ["italian"]}

        # Final text and recipe_ids present
        assert "text_delta" in types
        assert "recipe_ids" in types
        assert types[-1] == "done"

        # Two rounds → stream() called twice
        assert mock_client.stream.call_count == 2

    def test_system_prompt_prepended_to_messages(self, seeded_session):
        """The system prompt is always prepended before user messages."""
        async def run():
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.stream = MagicMock(
                return_value=_make_stream_cm(_text_sse_chunks("Done."))
            )
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}), \
                 patch("app.llm.orchestrator.httpx.AsyncClient", return_value=mock_client):
                async for _ in run_recommendation_stream(
                    [{"role": "user", "content": "test"}],
                    "test-model",
                    seeded_session,
                ):
                    pass
            return mock_client

        mock_client = _run_async(run())
        # Inspect what was passed to stream()
        call_json = mock_client.stream.call_args.kwargs["json"]
        messages = call_json["messages"]
        assert messages[0]["role"] == "system"
        assert len(messages[0]["content"]) > 50  # non-trivial system prompt
        assert messages[1] == {"role": "user", "content": "test"}
