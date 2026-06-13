import pytest

# Mirror the dashboard-auth tests: they mutate web_server.app.state at
# module level, so share the same xdist group to avoid cross-test races.
pytestmark = pytest.mark.xdist_group("dashboard_auth_app_state")

from fastapi.testclient import TestClient

from hermes_cli import web_server
from hermes_cli.dashboard_auth import clear_providers, register_provider
from tests.hermes_cli.conftest_dashboard_auth import StubAuthProvider


def test_muapi_key_registered_in_optional_env_vars():
    from hermes_cli.config import OPTIONAL_ENV_VARS

    assert "MUAPI_API_KEY" in OPTIONAL_ENV_VARS
    entry = OPTIONAL_ENV_VARS["MUAPI_API_KEY"]
    assert entry.get("password") is True


def test_studio_routes_attached_to_dashboard_app():
    from hermes_cli.web_server import app

    paths = {getattr(r, "path", None) for r in app.routes}
    for p in [
        "/api/studio/status",
        "/api/studio/models",
        "/api/studio/generate",
        "/api/studio/edit",
        "/api/studio/animate",
        "/api/studio/effect",
        "/api/studio/enhance",
        "/api/studio/upload",
        "/api/studio/jobs/{request_id}",
    ]:
        assert p in paths, f"{p} not attached"


@pytest.fixture
def gated_app():
    """web_server.app in gated mode on a non-loopback host so an
    unauthenticated request to a guarded /api/ route returns 401.

    Mirrors the ``gated_app_direct`` fixture in
    tests/hermes_cli/test_dashboard_auth_prefix.py - the established
    repo pattern for asserting auth on /api/ routes in-process.
    """
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


def test_studio_routes_require_auth(gated_app):
    """Live 401 assertion: pin that the 9 /api/studio/* routes are
    behind the dashboard auth gate so a future refactor cannot expose
    them (and the MUAPI key surface) unauthenticated. Uses the repo's
    established gated-app fixture pattern (non-loopback host +
    auth_required) rather than a structural-only check, because that
    pattern produces a real 401 in-process.
    """
    get_paths = [
        "/api/studio/status",
        "/api/studio/models",
        "/api/studio/generate",
        # Path param filled with a concrete value; the prefix gate runs
        # before route matching, so the value is irrelevant to the 401.
        "/api/studio/jobs/req-1",
    ]
    post_paths = [
        "/api/studio/edit",
        "/api/studio/animate",
        "/api/studio/effect",
        "/api/studio/enhance",
        "/api/studio/upload",
    ]
    for path in get_paths:
        resp = gated_app.get(path, follow_redirects=False)
        assert resp.status_code in (401, 403), (
            f"studio route {path} returned {resp.status_code}, expected "
            f"401/403 for an unauthenticated request - it must stay gated"
        )
    for path in post_paths:
        resp = gated_app.post(path, follow_redirects=False)
        assert resp.status_code in (401, 403), (
            f"studio route {path} returned {resp.status_code}, expected "
            f"401/403 for an unauthenticated request - it must stay gated"
        )
