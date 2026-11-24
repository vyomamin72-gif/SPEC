from datetime import datetime
from typing import Any

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

PROJECTILE: dict[str, Any] = {
    "name": "45 degree launch",
    "experiment_type": "projectile-motion",
    "schema_version": 1,
    "parameters": {
        "initialSpeed": 20.0,
        "launchAngleDeg": 45.0,
        "gravity": 9.80665,
        "drag": {"enabled": False},
    },
}


def create(client: TestClient, **overrides: Any) -> dict[str, Any]:
    response = client.post("/api/experiments", json={**PROJECTILE, **overrides})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def test_create_returns_stored_experiment_with_utc_timestamps(client: TestClient) -> None:
    body = create(client)
    assert body["id"] >= 1
    assert body["parameters"] == PROJECTILE["parameters"]
    assert body["description"] is None
    assert body["created_at"] == body["updated_at"]
    for field in ("created_at", "updated_at"):
        timestamp = datetime.fromisoformat(body[field])
        assert timestamp.utcoffset() is not None, "timestamps must be timezone-aware"
        assert timestamp.utcoffset().total_seconds() == 0  # type: ignore[union-attr]


def test_numbers_round_trip_without_loss(client: TestClient) -> None:
    precise = {"gravitationalConstant": 6.6743e-11, "solarMass": 1.98847e30, "third": 1 / 3}
    body = create(client, parameters=precise)
    assert client.get(f"/api/experiments/{body['id']}").json()["parameters"] == precise


def test_list_filters_by_type_and_orders_newest_first(client: TestClient) -> None:
    first = create(client, name="first")
    second = create(client, name="second")
    create(client, name="pendulum run", experiment_type="pendulum")

    projectiles = client.get("/api/experiments", params={"experiment_type": "projectile-motion"}).json()
    assert [e["id"] for e in projectiles] == [second["id"], first["id"]]
    assert len(client.get("/api/experiments").json()) == 3
    assert len(client.get("/api/experiments", params={"limit": 1}).json()) == 1


def test_patch_updates_only_given_fields(client: TestClient) -> None:
    original = create(client, description="draft")
    response = client.patch(f"/api/experiments/{original['id']}", json={"name": "renamed"})
    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "renamed"
    assert updated["description"] == "draft"
    assert updated["parameters"] == original["parameters"]
    assert updated["updated_at"] >= original["updated_at"]

    cleared = client.patch(f"/api/experiments/{original['id']}", json={"description": None}).json()
    assert cleared["description"] is None


def test_patch_rejects_null_for_required_fields(client: TestClient) -> None:
    experiment = create(client)
    for field in ("name", "schema_version", "parameters"):
        response = client.patch(f"/api/experiments/{experiment['id']}", json={field: None})
        assert response.status_code == 422, field


def test_delete_then_missing(client: TestClient) -> None:
    experiment = create(client)
    assert client.delete(f"/api/experiments/{experiment['id']}").status_code == 204
    assert client.get(f"/api/experiments/{experiment['id']}").status_code == 404
    assert client.delete(f"/api/experiments/{experiment['id']}").status_code == 404
    assert client.patch(f"/api/experiments/{experiment['id']}", json={"name": "x"}).status_code == 404


def test_rejects_invalid_envelopes(client: TestClient) -> None:
    invalid: list[dict[str, Any]] = [
        {"experiment_type": "Projectile Motion"},  # not URL-safe
        {"experiment_type": ""},
        {"name": "   "},  # blank after stripping
        {"schema_version": 0},
        {"parameters": [1, 2, 3]},  # must be a JSON object
    ]
    for overrides in invalid:
        response = client.post("/api/experiments", json={**PROJECTILE, **overrides})
        assert response.status_code == 422, overrides


def test_rejects_non_finite_numbers(client: TestClient) -> None:
    # Python's json module emits NaN/Infinity literals, which are not valid JSON
    # and would be rejected by PostgreSQL. They must never reach the database.
    for literal in ("NaN", "Infinity", "-Infinity"):
        body = (
            '{"name":"x","experiment_type":"pendulum","schema_version":1,'
            f'"parameters":{{"nested":{{"values":[1.0,{literal}]}}}}}}'
        )
        response = client.post("/api/experiments", content=body, headers={"Content-Type": "application/json"})
        assert response.status_code == 422, literal
        assert response.json()["detail"][0]["loc"] == ["body", "parameters"]
        assert "non-finite" in response.json()["detail"][0]["msg"]


def test_rejects_oversized_parameters(client: TestClient) -> None:
    limit = Settings().max_parameters_bytes
    response = client.post("/api/experiments", json={**PROJECTILE, "parameters": {"blob": "x" * limit}})
    assert response.status_code == 422


def test_data_persists_across_application_restarts(database_url: str) -> None:
    settings = Settings(database_url=database_url)
    with TestClient(create_app(settings)) as first_run:
        experiment_id = create(first_run)["id"]
    with TestClient(create_app(settings)) as second_run:
        assert second_run.get(f"/api/experiments/{experiment_id}").json()["name"] == PROJECTILE["name"]
