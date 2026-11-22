from fastapi.testclient import TestClient

from app import __version__


def test_health_reports_ok_with_working_database(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__, "database": "ok"}
