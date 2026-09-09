"""Browser-visible sync metadata for linked source folders."""

from types import SimpleNamespace
from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from deeptutor.api.routers import knowledge


def test_linked_folders_returns_last_successful_sync(monkeypatch: pytest.MonkeyPatch) -> None:
    """Expose the stored success timestamp without exposing internal per-file state."""
    manager = Mock()
    manager.get_linked_folders.return_value = [
        {"id": "new", "path": "/notes/new", "added_at": "2026-09-01T12:00:00", "file_count": 2},
        {
            "id": "synced",
            "path": "/notes/synced",
            "added_at": "2026-09-01T12:00:00",
            "file_count": 3,
            "last_sync": "2026-09-09T12:30:00",
            "synced_files": {"/notes/synced/note.md": "2026-09-09T12:00:00"},
        },
    ]
    monkeypatch.setattr(knowledge, "resolve_kb", lambda _name: SimpleNamespace(name="resolved-kb"))
    monkeypatch.setattr(knowledge, "manager_for_resource", lambda _resource: manager)
    app = FastAPI()
    app.include_router(knowledge.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get("/api/knowledge-bases/notes/linked-folders")

    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["last_sync"] is None
    assert rows[1]["last_sync"] == "2026-09-09T12:30:00"
    assert "synced_files" not in rows[1]
    manager.get_linked_folders.assert_called_once_with("resolved-kb")
