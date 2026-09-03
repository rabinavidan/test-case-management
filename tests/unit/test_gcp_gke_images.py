"""Unit tests for deploy/gcp/gke_images.py — pure command-building functions
and dry-run execution only, no real docker calls, no I/O.
"""
import pytest

from deploy.gcp.gke_images import (
    SERVICES,
    build_and_push_all,
    build_and_push_all_commands,
    build_command,
    image_uri,
    push_command,
)


def test_services_lists_all_five_microservices():
    assert SERVICES == ["gateway", "auth", "projects", "runs", "ai"]


def test_image_uri_format():
    assert image_uri("my-project", "us-central1", "auth", "v1") == "us-central1-docker.pkg.dev/my-project/testflow/auth:v1"


def test_image_uri_rejects_unknown_service():
    with pytest.raises(ValueError):
        image_uri("my-project", "us-central1", "not-a-service", "v1")


def test_build_command_uses_services_subdirectory_as_context():
    cmd = build_command("my-project", "us-central1", "auth", "v1")
    assert cmd[:2] == ["docker", "build"]
    assert cmd[-1] == "services/auth"
    assert image_uri("my-project", "us-central1", "auth", "v1") in cmd


def test_push_command_pushes_same_image_uri():
    cmd = push_command("my-project", "us-central1", "auth", "v1")
    assert cmd == ["docker", "push", image_uri("my-project", "us-central1", "auth", "v1")]


def test_build_and_push_all_commands_covers_every_service_in_order():
    commands = build_and_push_all_commands("my-project", "us-central1", "latest")
    assert len(commands) == len(SERVICES) * 2
    for i, service in enumerate(SERVICES):
        build_cmd, push_cmd = commands[2 * i], commands[2 * i + 1]
        assert build_cmd[:2] == ["docker", "build"]
        assert build_cmd[-1] == f"services/{service}"
        assert push_cmd[:2] == ["docker", "push"]


def test_build_and_push_all_commands_respects_service_subset():
    commands = build_and_push_all_commands("my-project", "us-central1", "latest", services=["auth", "runs"])
    assert len(commands) == 4
    assert "services/auth" in commands[0]
    assert "services/runs" in commands[2]


def test_build_and_push_all_dry_run_prints_without_subprocess_calls(monkeypatch, capsys):
    called = []
    monkeypatch.setattr("subprocess.run", lambda *a, **k: called.append((a, k)))

    build_and_push_all("my-project", "us-central1", "latest", services=["auth"], dry_run=True)

    assert called == []
    out = capsys.readouterr().out
    assert "[dry-run]" in out
    assert "services/auth" in out


def test_build_and_push_all_apply_invokes_subprocess_for_each_command(monkeypatch):
    calls = []
    monkeypatch.setattr("subprocess.run", lambda cmd, **k: calls.append(cmd))

    build_and_push_all("my-project", "us-central1", "latest", services=["auth", "runs"], dry_run=False)

    assert len(calls) == 4
