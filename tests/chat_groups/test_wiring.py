import pytest

pytestmark = pytest.mark.xdist_group("dashboard_auth_app_state")

from fastapi.testclient import TestClient

from hermes_cli import web_server
from hermes_cli.dashboard_auth import clear_providers, register_provider
from tests.hermes_cli.conftest_dashboard_auth import StubAuthProvider


def test_chat_group_routes_attached_to_dashboard_app():
    from hermes_cli.web_server import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/chat/groups" in paths
    assert "/api/chat/groups/{group_id}" in paths
    assert "/api/chat/groups/{group_id}/members/{session_id}" in paths


@pytest.fixture
def gated_app():
    clear_providers()
    register_provider(StubAuthProvider())
    prev_host = getattr(web_server.app.state, "bound_host", None)
    prev_port = getattr(web_server.app.state, "bound_port", None)
    prev_required = getattr(web_server.app.state, "auth_required", None)
    web_server.app.state.bound_host = "fly-app.fly.dev"
    web_server.app.state.bound_port = 443
    web_server.app.state.auth_required = True
    client = TestClient(web_server.app, base_url="https://fly-app.fly.dev")
    yield client
    clear_providers()
    web_server.app.state.bound_host = prev_host
    web_server.app.state.bound_port = prev_port
    web_server.app.state.auth_required = prev_required


def test_chat_group_routes_require_auth(gated_app):
    resp = gated_app.get("/api/chat/groups", follow_redirects=False)
    assert resp.status_code in (401, 403), (
        f"/api/chat/groups returned {resp.status_code}, expected 401/403 "
        "for an unauthenticated request - it must stay gated"
    )
