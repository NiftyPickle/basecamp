"""FastAPI routes for the dashboard conversation-library groups.

Thin handlers over ``SessionDB`` chat-group methods. They inherit the
dashboard's ``/api/`` auth gate (these paths are deliberately NOT listed in
``PUBLIC_API_PATHS``). No secrets are involved. Errors return structured
``{error_code, message}`` envelopes; the generic-exception guard prevents
traceback leakage.
"""

from __future__ import annotations

import time
from typing import Callable, Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

_NAME_MAX = 100


class CreateGroupBody(BaseModel):
    name: str


class PatchGroupBody(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None


def _validation_err(message: str) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error_code": "validation", "message": message})


def _not_found() -> JSONResponse:
    return JSONResponse(status_code=404, content={"error_code": "not_found", "message": "group not found"})


def _internal_err() -> JSONResponse:
    return JSONResponse(status_code=500, content={"error_code": "internal", "message": "internal error"})


def _clean_name(raw: object) -> Optional[str]:
    if not isinstance(raw, str):
        return None
    trimmed = raw.strip()
    if not trimmed or len(trimmed) > _NAME_MAX:
        return None
    return trimmed


def _default_db_factory():
    # Production path: open this process's own state.db, matching how the
    # session endpoints open it.
    from hermes_cli.web_server import _open_session_db_for_profile

    return _open_session_db_for_profile(None)


def _live_session_ids(db, session_ids: list[str]) -> list[str]:
    """Filter out member ids with no matching live session row."""
    kept = []
    for sid in session_ids:
        if db.resolve_session_id(sid):
            kept.append(sid)
    return kept


def register_chat_group_routes(app: FastAPI, db_factory: Optional[Callable] = None) -> None:
    factory = db_factory or _default_db_factory

    @app.get("/api/chat/groups", response_model=None)
    async def list_groups():
        db = factory()
        try:
            groups = db.list_chat_groups()
            for g in groups:
                g["session_ids"] = _live_session_ids(db, g.get("session_ids", []))
            return {"groups": groups}
        except Exception:
            return _internal_err()
        finally:
            db.close()

    @app.post("/api/chat/groups", response_model=None)
    async def create_group(body: CreateGroupBody):
        name = _clean_name(body.name)
        if name is None:
            return _validation_err("name required, 1-100 chars")
        db = factory()
        try:
            return db.create_chat_group(name, now=time.time())
        except Exception:
            return _internal_err()
        finally:
            db.close()

    @app.patch("/api/chat/groups/{group_id}", response_model=None)
    async def patch_group(group_id: str, body: PatchGroupBody):
        db = factory()
        try:
            now = time.time()
            updated = None
            if body.name is None and body.position is None:
                return _validation_err("name or position required")
            if body.name is not None:
                name = _clean_name(body.name)
                if name is None:
                    return _validation_err("name required, 1-100 chars")
                updated = db.rename_chat_group(group_id, name, now=now)
                if updated is None:
                    return _not_found()
            if body.position is not None:
                if not db.set_group_position(group_id, int(body.position), now=now):
                    return _not_found()
            if updated is None:
                # position-only update: re-read for the response
                for g in db.list_chat_groups():
                    if g["id"] == group_id:
                        updated = g
                        break
                if updated is None:
                    return _not_found()
            return updated
        except Exception:
            return _internal_err()
        finally:
            db.close()

    @app.delete("/api/chat/groups/{group_id}", response_model=None)
    async def delete_group(group_id: str):
        db = factory()
        try:
            if not db.delete_chat_group(group_id):
                return _not_found()
            return {"ok": True}
        except Exception:
            return _internal_err()
        finally:
            db.close()

    @app.put("/api/chat/groups/{group_id}/members/{session_id}", response_model=None)
    async def add_member(group_id: str, session_id: str):
        db = factory()
        try:
            groups = {g["id"] for g in db.list_chat_groups()}
            if group_id not in groups:
                return _not_found()
            db.assign_conversation(group_id, session_id, now=time.time())
            return {"ok": True}
        except Exception:
            return _internal_err()
        finally:
            db.close()

    @app.delete("/api/chat/groups/{group_id}/members/{session_id}", response_model=None)
    async def remove_member(group_id: str, session_id: str):
        db = factory()
        try:
            db.unassign_conversation(session_id)
            return {"ok": True}
        except Exception:
            return _internal_err()
        finally:
            db.close()
