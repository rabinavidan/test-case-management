"""Unit tests for deploy/gcp/gke_images.py — pure command-building functions
and dry-run execution only, no real docker calls, no I/O.
"""
import pytest

from deploy.gcp.gke_images import (
    SERVICES,
    build_and_push_all,
    build_and_push_all_commands,
    build_command,
    dockerfile_path,
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


def test_dockerfile_path_uses_plain_dockerfile_for_most_services():
    assert dockerfile_path("auth") == "services/auth/Dockerfile"
    assert dockerfile_path("projects") == "services/projects/Dockerfile"
    assert dockerfile_path("runs") == "services/runs/Dockerfile"
    assert dockerfile_path("ai") == "services/ai/Dockerfile"


def test_dockerfile_path_uses_gateways_oddly_named_dockerfile():
    assert dockerfile_path("gateway") == "services/gateway/Dockerfile_gateway"


def test_dockerfile_path_rejects_unknown_service():
    with pytest.raises(ValueError):
        dockerfile_path("not-a-service")


def test_build_command_uses_repo_root_as_context():
    # Not services/auth in isolation — main.py needs services.common.*,
    # shared.schemas, etc. resolvable by their full dotted path, which only
    # works when the whole repo is the build context. See issue #217.
    cmd = build_command("my-project", "us-central1", "auth", "v1")
    assert cmd[:2] == ["docker", "build"]
    assert cmd[-1] == "."
    assert "-f" in cmd
    assert cmd[cmd.index("-f") + 1] == "services/auth/Dockerfile"
    assert image_uri("my-project", "us-central1", "auth", "v1") in cmd


def test_build_command_uses_gateways_dockerfile():
    cmd = build_command("my-project", "us-central1", "gateway", "v1")
    assert cmd[cmd.index("-f") + 1] == "services/gateway/Dockerfile_gateway"


def test_push_command_pushes_same_image_uri():
    cmd = push_command("my-project", "us-central1", "auth", "v1")
    assert cmd == ["docker", "push", image_uri("my-project", "us-central1", "auth", "v1")]


def test_build_and_push_all_commands_covers_every_service_in_order():
    commands = build_and_push_all_commands("my-project", "us-central1", "latest")
    assert len(commands) == len(SERVICES) * 2
    for i, service in enumerate(SERVICES):
        build_cmd, push_cmd = commands[2 * i], commands[2 * i + 1]
        assert build_cmd[:2] == ["docker", "build"]
        assert build_cmd[-1] == "."
        assert build_cmd[build_cmd.index("-f") + 1] == dockerfile_path(service)
        assert push_cmd[:2] == ["docker", "push"]


def test_build_and_push_all_commands_respects_service_subset():
    commands = build_and_push_all_commands("my-project", "us-central1", "latest", services=["auth", "runs"])
    assert len(commands) == 4
    assert "services/auth/Dockerfile" in commands[0]
    assert "services/runs/Dockerfile" in commands[2]


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
