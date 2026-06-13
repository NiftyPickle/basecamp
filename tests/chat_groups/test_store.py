import tempfile
from pathlib import Path

import pytest

from hermes_state import SessionDB


@pytest.fixture
def db():
    tmp = tempfile.TemporaryDirectory()
    handle = SessionDB(db_path=Path(tmp.name) / "state.db")
    yield handle
    handle.close()
    tmp.cleanup()


def test_chat_group_tables_exist(db):
    names = {
        row[0]
        for row in db._conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    assert "chat_groups" in names
    assert "chat_group_members" in names


def test_create_chat_group_returns_record(db):
    group = db.create_chat_group("Work", now=100.0)
    assert group["name"] == "Work"
    assert group["position"] == 0
    assert group["created_at"] == 100.0
    assert group["updated_at"] == 100.0
    assert isinstance(group["id"], str) and len(group["id"]) > 0
    assert group["session_ids"] == []


def test_list_chat_groups_orders_by_position(db):
    a = db.create_chat_group("A", now=1.0)
    b = db.create_chat_group("B", now=2.0)
    db.set_group_position(b["id"], 0, now=3.0)
    db.set_group_position(a["id"], 1, now=3.0)
    groups = db.list_chat_groups()
    assert [g["name"] for g in groups] == ["B", "A"]
    assert all(g["session_ids"] == [] for g in groups)


def test_rename_chat_group_updates_name(db):
    group = db.create_chat_group("Old", now=10.0)
    updated = db.rename_chat_group(group["id"], "New", now=20.0)
    assert updated is not None
    assert updated["name"] == "New"
    assert updated["updated_at"] == 20.0
    assert updated["created_at"] == 10.0
    assert updated["position"] == group["position"]
    assert updated["session_ids"] == []
    groups = db.list_chat_groups()
    assert groups[0]["name"] == "New"


def test_rename_chat_group_unknown_returns_none(db):
    assert db.rename_chat_group("does-not-exist", "Whatever", now=5.0) is None


def test_assign_conversation_adds_member(db):
    g = db.create_chat_group("G", now=1.0)
    assert db.assign_conversation(g["id"], "sess-1", now=2.0) is True
    assert db.list_chat_groups()[0]["session_ids"] == ["sess-1"]


def test_assign_moves_conversation_out_of_prior_group(db):
    g1 = db.create_chat_group("G1", now=1.0)
    g2 = db.create_chat_group("G2", now=1.0)
    db.assign_conversation(g1["id"], "sess-1", now=2.0)
    db.assign_conversation(g2["id"], "sess-1", now=3.0)
    groups = {g["id"]: g for g in db.list_chat_groups()}
    assert groups[g1["id"]]["session_ids"] == []
    assert groups[g2["id"]]["session_ids"] == ["sess-1"]


def test_unassign_conversation_removes_member(db):
    g = db.create_chat_group("G", now=1.0)
    db.assign_conversation(g["id"], "sess-1", now=2.0)
    assert db.unassign_conversation("sess-1") is True
    assert db.list_chat_groups()[0]["session_ids"] == []


def test_unassign_unknown_session_returns_false(db):
    assert db.unassign_conversation("never-added") is False


def test_delete_chat_group_removes_group_and_members(db):
    g = db.create_chat_group("G", now=1.0)
    db.assign_conversation(g["id"], "sess-1", now=2.0)
    assert db.delete_chat_group(g["id"]) is True
    assert db.list_chat_groups() == []
    # member row is gone, so the conversation is ungrouped (no orphan row)
    orphan = db._conn.execute(
        "SELECT COUNT(*) FROM chat_group_members WHERE group_id = ?", (g["id"],)
    ).fetchone()[0]
    assert orphan == 0


def test_delete_unknown_group_returns_false(db):
    assert db.delete_chat_group("nope") is False
