"""shared/spa.py: which paths the SPA's index.html fallback may answer, and
that e2e/serve-static.py's standalone copy agrees with it."""
import importlib.util
import pathlib

import pytest

from shared.spa import is_page_path

PATHS = {
    "": True,
    "projects": True,
    "some/deep/client-side-route": True,
    "api": False,
    "api/does-not-exist": False,
    "api/projects/1/nope": False,
    "ws/runs/1": False,
    "static/missing.js": False,
    "_vercel/insights/script.js": False,
    "favicon.ico": False,
    "app.js": False,
    "assets/logo.png": False,
    "deep/path/file.map": False,
}


@pytest.mark.parametrize("path,expected", PATHS.items())
def test_is_page_path(path, expected):
    assert is_page_path(path) is expected
    assert is_page_path("/" + path) is expected


def test_serve_static_mirror_agrees():
    src = pathlib.Path(__file__).resolve().parents[2] / "e2e" / "serve-static.py"
    spec = importlib.util.spec_from_file_location("serve_static", src)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for path, expected in PATHS.items():
        assert mod.is_page_path(path) is expected, path
