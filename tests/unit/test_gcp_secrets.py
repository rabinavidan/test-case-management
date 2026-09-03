"""Unit tests for deploy/gcp/secrets.py — pure command-building functions and
dry-run/sync orchestration only, no real gcloud calls, no I/O.
"""
from deploy.gcp.secrets import (
    SECRET_NAMES,
    build_add_version_command,
    build_create_secret_command,
    run_sync,
    secret_exists_command,
    sync_secret,
)


def test_secret_names_maps_known_app_env_vars():
    assert SECRET_NAMES["JWT_SECRET_KEY"] == "jwt-secret-key"
    assert SECRET_NAMES["ANTHROPIC_API_KEY"] == "anthropic-api-key"


def test_secret_exists_command_scopes_to_project():
    cmd = secret_exists_command("my-project", "jwt-secret-key")
    assert cmd == ["gcloud", "secrets", "describe", "jwt-secret-key", "--project", "my-project"]


def test_build_create_secret_command_uses_automatic_replication():
    cmd = build_create_secret_command("my-project", "jwt-secret-key")
    assert cmd[:4] == ["gcloud", "secrets", "create", "jwt-secret-key"]
    assert "--replication-policy" in cmd and "automatic" in cmd


def test_build_add_version_command_reads_from_stdin():
    cmd = build_add_version_command("my-project", "jwt-secret-key")
    assert cmd == [
        "gcloud", "secrets", "versions", "add", "jwt-secret-key",
        "--project", "my-project",
        "--data-file", "-",
    ]


def test_sync_secret_dry_run_makes_no_subprocess_calls(monkeypatch, capsys):
    called = []
    monkeypatch.setattr("subprocess.run", lambda *a, **k: called.append((a, k)))

    sync_secret("my-project", "jwt-secret-key", "super-secret-value", dry_run=True)

    assert called == []
    out = capsys.readouterr().out
    assert "super-secret-value" not in out
    assert "<secret value>" in out


def test_sync_secret_creates_when_missing_then_adds_version(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append((cmd, kwargs))

        class Result:
            returncode = 1  # "describe" reports the secret doesn't exist yet

        return Result()

    monkeypatch.setattr("subprocess.run", fake_run)

    sync_secret("my-project", "jwt-secret-key", "super-secret-value", dry_run=False)

    describe_call, create_call, add_version_call = calls
    assert describe_call[0][:3] == ["gcloud", "secrets", "describe"]
    assert create_call[0][:3] == ["gcloud", "secrets", "create"]
    assert add_version_call[0][:4] == ["gcloud", "secrets", "versions", "add"]
    assert add_version_call[1]["input"] == b"super-secret-value"


def test_sync_secret_skips_create_when_secret_already_exists(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)

        class Result:
            returncode = 0  # already exists

        return Result()

    monkeypatch.setattr("subprocess.run", fake_run)

    sync_secret("my-project", "jwt-secret-key", "super-secret-value", dry_run=False)

    assert len(calls) == 2  # describe + add-version, no create
    assert calls[1][:4] == ["gcloud", "secrets", "versions", "add"]


def test_run_sync_only_syncs_provided_values(monkeypatch):
    synced = []
    monkeypatch.setattr(
        "deploy.gcp.secrets.sync_secret",
        lambda project_id, secret_id, value, dry_run=True: synced.append(secret_id),
    )

    run_sync("my-project", {"JWT_SECRET_KEY": "abc"}, dry_run=True)

    assert synced == ["jwt-secret-key"]
