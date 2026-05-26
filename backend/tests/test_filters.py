import pytest
from fastapi.testclient import TestClient


def ids(resp) -> set[int]:
    return {item["id"] for item in resp.json()["items"]}


def test_list_all_recipes(client: TestClient):
    resp = client.get("/api/v1/recipes")
    assert resp.status_code == 200
    assert resp.json()["total"] == 3
    assert len(resp.json()["items"]) == 3


def test_filter_by_course(client: TestClient):
    resp = client.get("/api/v1/recipes?course=main")
    assert resp.status_code == 200
    assert resp.json()["total"] == 3

    resp = client.get("/api/v1/recipes?course=side")
    assert resp.json()["total"] == 0


def test_filter_by_difficulty_easy(client: TestClient):
    resp = client.get("/api/v1/recipes?difficulty=easy")
    assert resp.status_code == 200
    assert ids(resp) == {1, 3}


def test_filter_by_difficulty_medium(client: TestClient):
    resp = client.get("/api/v1/recipes?difficulty=medium")
    assert ids(resp) == {2}


def test_filter_by_total_time(client: TestClient):
    resp = client.get("/api/v1/recipes?total_time=under-30-min")
    assert ids(resp) == {1}

    resp = client.get("/api/v1/recipes?total_time=30-60-min")
    assert ids(resp) == {2, 3}


def test_filter_cuisine_or_semantics(client: TestClient):
    # Both Italian and north indian — OR within field
    resp = client.get("/api/v1/recipes?cuisine=italian&cuisine=north+indian")
    assert resp.status_code == 200
    assert ids(resp) == {1, 2, 3}


def test_filter_cuisine_single(client: TestClient):
    resp = client.get("/api/v1/recipes?cuisine=italian")
    assert ids(resp) == {1}


def test_filter_dietary_or_semantics(client: TestClient):
    resp = client.get("/api/v1/recipes?dietary=contains-dairy&dietary=vegan")
    assert ids(resp) == {1, 2, 3}


def test_filter_dietary_single(client: TestClient):
    resp = client.get("/api/v1/recipes?dietary=vegan")
    assert ids(resp) == {2}


def test_filter_key_ingredient_single(client: TestClient):
    resp = client.get("/api/v1/recipes?key_ingredient=garlic")
    assert ids(resp) == {1, 3}  # r1 and r3 both have garlic


def test_filter_key_ingredient_and_semantics(client: TestClient):
    # Must have BOTH garlic AND paneer — only r3
    resp = client.get("/api/v1/recipes?key_ingredient=garlic&key_ingredient=paneer")
    assert ids(resp) == {3}


def test_filter_key_ingredient_no_match(client: TestClient):
    resp = client.get("/api/v1/recipes?key_ingredient=tofu")
    assert ids(resp) == set()


def test_filter_has_ingredient_single(client: TestClient):
    resp = client.get("/api/v1/recipes?has_ingredient=garlic")
    assert ids(resp) == {1, 3}


def test_filter_has_ingredient_and_semantics(client: TestClient):
    # r1 has garlic AND bell pepper
    resp = client.get("/api/v1/recipes?has_ingredient=garlic&has_ingredient=bell+pepper")
    assert ids(resp) == {1}


def test_filter_has_ingredient_alias_resolution(client: TestClient):
    # capsicum -> bell pepper; r1 has bell pepper
    resp = client.get("/api/v1/recipes?has_ingredient=capsicum")
    assert ids(resp) == {1}


def test_filter_key_ingredient_alias_resolution(client: TestClient):
    # "hing" resolves to "asafoetida" which is not in any recipe's key_ingredients
    # so this should return empty (alias resolution working, just no match)
    resp = client.get("/api/v1/recipes?key_ingredient=hing")
    assert ids(resp) == set()

    # garlic resolves to garlic (identity alias)
    resp = client.get("/api/v1/recipes?key_ingredient=garlic")
    assert ids(resp) == {1, 3}


def test_filter_q_matches_title(client: TestClient):
    resp = client.get("/api/v1/recipes?q=pasta")
    assert 1 in ids(resp)


def test_filter_q_matches_ingredient(client: TestClient):
    resp = client.get("/api/v1/recipes?q=lentil")
    assert ids(resp) == {2}


def test_filter_q_case_insensitive(client: TestClient):
    resp = client.get("/api/v1/recipes?q=PANEER")
    assert 3 in ids(resp)


def test_filter_combined_cuisine_and_difficulty(client: TestClient):
    resp = client.get("/api/v1/recipes?cuisine=north+indian&difficulty=easy")
    assert ids(resp) == {3}  # r2 is north indian medium, r3 is north indian easy


def test_filter_combined_cuisine_and_key_ingredient(client: TestClient):
    resp = client.get("/api/v1/recipes?cuisine=north+indian&key_ingredient=paneer")
    assert ids(resp) == {3}


def test_sort_title_alphabetical(client: TestClient):
    resp = client.get("/api/v1/recipes?sort=title")
    assert resp.status_code == 200
    titles = [item["title_clean"] for item in resp.json()["items"]]
    assert titles == sorted(titles, key=str.lower)


def test_sort_recent(client: TestClient):
    resp = client.get("/api/v1/recipes?sort=recent")
    assert resp.status_code == 200
    items = resp.json()["items"]
    # r3 published 2023, r1 published 2022, r2 published 2021
    assert items[0]["id"] == 3
    assert items[1]["id"] == 1
    assert items[2]["id"] == 2


def test_sort_random(client: TestClient):
    resp = client.get("/api/v1/recipes?sort=random")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 3


def test_sort_invalid(client: TestClient):
    resp = client.get("/api/v1/recipes?sort=newest")
    assert resp.status_code == 422


def test_pagination_limit(client: TestClient):
    resp = client.get("/api/v1/recipes?limit=2")
    assert resp.status_code == 200
    assert resp.json()["total"] == 3
    assert len(resp.json()["items"]) == 2
    assert resp.json()["limit"] == 2


def test_pagination_offset(client: TestClient):
    resp_all = client.get("/api/v1/recipes?sort=title")
    all_ids = [item["id"] for item in resp_all.json()["items"]]

    resp = client.get("/api/v1/recipes?sort=title&limit=2&offset=1")
    assert resp.json()["offset"] == 1
    page_ids = [item["id"] for item in resp.json()["items"]]
    assert page_ids == all_ids[1:3]


def test_pagination_limit_max(client: TestClient):
    resp = client.get("/api/v1/recipes?limit=201")
    assert resp.status_code == 422


def test_invalid_course_filter_returns_422(client: TestClient):
    resp = client.get("/api/v1/recipes?course=snacks")
    assert resp.status_code == 422


def test_invalid_difficulty_filter_returns_422(client: TestClient):
    resp = client.get("/api/v1/recipes?difficulty=trivial")
    assert resp.status_code == 422


def test_invalid_total_time_filter_returns_422(client: TestClient):
    resp = client.get("/api/v1/recipes?total_time=fast")
    assert resp.status_code == 422


def test_list_response_includes_tags(client: TestClient):
    resp = client.get("/api/v1/recipes?sort=title&limit=1&offset=0")
    item = resp.json()["items"][0]
    assert "cuisine" in item
    assert "cooking_method" in item
    assert "dietary" in item
    assert "key_ingredients" in item
