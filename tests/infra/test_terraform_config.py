"""Infra tests for Milestone 4 (Terraform) — run the real `terraform`
binary (fmt, init -backend=false, validate) against terraform/. No real GCP
project or credentials are touched: -backend=false skips remote state, and
validate only checks the config's internal consistency against the
provider schema, never calling the GCP API.

Requires `terraform` on PATH (CI installs it — see .github/workflows/test.yml's
"Infra (k8s + terraform)" job); skipped locally if it's missing.
"""
import json
import pathlib
import shutil
import subprocess

import pytest

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
TERRAFORM_DIR = REPO_ROOT / "terraform"

pytestmark = pytest.mark.skipif(shutil.which("terraform") is None, reason="terraform not installed")


def _run(*args):
    return subprocess.run(["terraform", *args], cwd=TERRAFORM_DIR, capture_output=True, text=True)


@pytest.fixture(scope="module", autouse=True)
def _terraform_initialized():
    """`validate` requires the provider schema from `init`; -backend=false
    skips remote state so this never touches a real GCS bucket or GCP
    project."""
    result = _run("init", "-backend=false", "-input=false")
    assert result.returncode == 0, result.stdout + result.stderr


def test_terraform_fmt_is_clean():
    result = _run("fmt", "-check", "-recursive", "-diff")
    assert result.returncode == 0, f"terraform fmt found unformatted files:\n{result.stdout}"


def test_terraform_validate_passes():
    result = _run("validate", "-json")
    payload = json.loads(result.stdout)
    assert payload["valid"] is True, payload.get("diagnostics")
