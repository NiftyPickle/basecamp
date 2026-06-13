"""Manual smoke test against the real MUAPI API. Skipped unless MUAPI_API_KEY
is set AND the muapi binary is installed. Marked integration so the default
pytest run can exclude it. Costs real credits when run.

Run explicitly with:
    uv run --with pytest pytest tests/studio/test_muapi_smoke.py -m integration -v
"""

import os
import shutil

import pytest

from hermes_cli.studio.muapi_client import MuapiClient

_HAS_KEY = bool(os.environ.get("MUAPI_API_KEY"))
_HAS_BIN = shutil.which("muapi") is not None


@pytest.mark.integration
@pytest.mark.skipif(not (_HAS_KEY and _HAS_BIN), reason="needs MUAPI_API_KEY and muapi binary")
def test_video_catalog_is_reachable():
    client = MuapiClient(api_key_provider=lambda: os.environ["MUAPI_API_KEY"])
    models = client.list_models(category="video")
    names = {m.get("name") for m in models}
    assert "veo3" in names
