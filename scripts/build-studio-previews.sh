#!/usr/bin/env bash
# Wrapper for the preview builder. No credentials required: it downloads
# rights-clean public demo assets for each effect. Idempotent and resumable:
# reruns only fill missing keys in web/public/studio-previews.json; preview
# files land in web/public/studio-previews/ and ship inside the app bundle.
set -euo pipefail
cd "$(dirname "$0")/.."
exec env PYTHONPATH=scripts .venv/bin/python -m build_studio_previews "$@"
