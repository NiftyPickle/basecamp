import inspect

import hermes_cli.web_server as ws_mod


def test_council_ws_route_registered():
    src = inspect.getsource(ws_mod)
    assert '@app.websocket("/api/council/ws")' in src
    assert "handle_council_ws" in src


def test_openrouter_info_route_registered():
    src = inspect.getsource(ws_mod)
    assert '@app.get("/api/openrouter/info")' in src
    assert "build_openrouter_info" in src
