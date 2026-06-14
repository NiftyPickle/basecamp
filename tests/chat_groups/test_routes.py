import tempfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hermes_state import SessionDB
from hermes_cli.chat_groups.routes import register_chat_group_routes


@pytest.fixture
def ctx():
    tmp = tempfile.TemporaryDirectory()
    db_path = Path(tmp.name) / "state.db"

    def db_factory():
        return SessionDB(db_path=db_path)

    app = FastAPI()
    register_chat_group_routes(app, db_factory=db_factory)
    yield TestClient(app), db_factory
    tmp.cleanup()


@pytest.fixture
def client(ctx):
    return ctx[0]


def _seed_session(db_factory, session_id):
    db = db_factory()
    try:
        db.create_session(session_id=session_id, source="test", model="test")
    finally:
        db.close()


def test_create_then_list_group(client):
    created = client.post("/api/chat/groups", json={"name": "Work"})
    assert created.status_code == 200
    body = created.json()
    assert body["name"] == "Work"
    assert body["session_ids"] == []

    listed = client.get("/api/chat/groups")
    assert listed.status_code == 200
    assert [g["name"] for g in listed.json()["groups"]] == ["Work"]


def test_create_blank_name_is_400(client):
    resp = client.post("/api/chat/groups", json={"name": "   "})
    assert resp.status_code == 400
    assert resp.json()["error_code"] == "validation"


def test_rename_unknown_group_is_404(client):
    resp = client.patch("/api/chat/groups/nope", json={"name": "X"})
    assert resp.status_code == 404
    assert resp.json()["error_code"] == "not_found"


def test_patch_empty_body_is_400(client):
    gid = client.post("/api/chat/groups", json={"name": "G"}).json()["id"]
    resp = client.patch(f"/api/chat/groups/{gid}", json={})
    assert resp.status_code == 400
    assert resp.json()["error_code"] == "validation"


def test_assign_and_unassign_member(ctx):
    client, db_factory = ctx
    _seed_session(db_factory, "sess-1")
    gid = client.post("/api/chat/groups", json={"name": "G"}).json()["id"]
    put = client.put(f"/api/chat/groups/{gid}/members/sess-1")
    assert put.status_code == 200
    assert put.json() == {"ok": True}
    assert client.get("/api/chat/groups").json()["groups"][0]["session_ids"] == ["sess-1"]

    rm = client.delete(f"/api/chat/groups/{gid}/members/sess-1")
    assert rm.status_code == 200
    assert client.get("/api/chat/groups").json()["groups"][0]["session_ids"] == []


def test_assign_to_unknown_group_is_404(ctx):
    client, db_factory = ctx
    _seed_session(db_factory, "sess-1")
    resp = client.put("/api/chat/groups/does-not-exist/members/sess-1")
    assert resp.status_code == 404
    assert resp.json()["error_code"] == "not_found"


def test_delete_group(client):
    gid = client.post("/api/chat/groups", json={"name": "G"}).json()["id"]
    resp = client.delete(f"/api/chat/groups/{gid}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert client.get("/api/chat/groups").json()["groups"] == []


def test_list_filters_orphan_member_sessions(ctx):
    client, db_factory = ctx
    # Member whose session_id has no live session row is dropped from GET.
    gid = client.post("/api/chat/groups", json={"name": "G"}).json()["id"]
    client.put(f"/api/chat/groups/{gid}/members/ghost-session")
    groups = client.get("/api/chat/groups").json()["groups"]
    assert groups[0]["session_ids"] == []


def test_create_with_description_and_instructions(client):
    resp = client.post(
        "/api/chat/groups",
        json={"name": "Work", "description": "client work", "instructions": "be concise"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["description"] == "client work"
    assert body["instructions"] == "be concise"
    listed = client.get("/api/chat/groups").json()["groups"][0]
    assert listed["description"] == "client work"
    assert listed["instructions"] == "be concise"


def test_create_defaults_blank_description_instructions(client):
    body = client.post("/api/chat/groups", json={"name": "Work"}).json()
    assert body["description"] == ""
    assert body["instructions"] == ""


def test_patch_description_and_instructions(client):
    gid = client.post("/api/chat/groups", json={"name": "G"}).json()["id"]
    resp = client.patch(
        f"/api/chat/groups/{gid}",
        json={"description": "new desc", "instructions": "new rules"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["description"] == "new desc"
    assert body["instructions"] == "new rules"
    assert body["name"] == "G"


def test_patch_instructions_only_keeps_name(client):
    gid = client.post("/api/chat/groups", json={"name": "Keep"}).json()["id"]
    body = client.patch(f"/api/chat/groups/{gid}", json={"instructions": "x"}).json()
    assert body["name"] == "Keep"
    assert body["instructions"] == "x"


def test_create_description_too_long_is_400(client):
    resp = client.post(
        "/api/chat/groups",
        json={"name": "G", "description": "x" * 501},
    )
    assert resp.status_code == 400
    assert resp.json()["error_code"] == "validation"


def test_create_instructions_too_long_is_400(client):
    resp = client.post(
        "/api/chat/groups",
        json={"name": "G", "instructions": "x" * 16001},
    )
    assert resp.status_code == 400
    assert resp.json()["error_code"] == "validation"
