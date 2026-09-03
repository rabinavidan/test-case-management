"""Unit tests for deploy/gcp/cloud_run.py — pure command-building functions
and dry-run execution only, no real gcloud/docker calls, no I/O.
"""
import pytest

from deploy.gcp.cloud_run import (
    DeployConfig,
    artifact_registry_image_uri,
    build_all_commands,
    build_docker_build_command,
    build_docker_push_command,
    build_gcloud_deploy_command,
    run_deploy,
)


def test_deploy_config_requires_project_id():
    with pytest.raises(ValueError):
        DeployConfig(project_id="", region="us-central1")


def test_deploy_config_requires_region():
    with pytest.raises(ValueError):
        DeployConfig(project_id="my-project", region="")


def test_artifact_registry_image_uri_format():
    config = DeployConfig(project_id="my-project", region="us-central1", repo="testflow", service="testflow-api", image_tag="v1")
    assert artifact_registry_image_uri(config) == "us-central1-docker.pkg.dev/my-project/testflow/testflow-api:v1"


def test_build_docker_build_command_tags_with_image_uri():
    config = DeployConfig(project_id="my-project", region="us-central1")
    cmd = build_docker_build_command(config)
    assert cmd[:2] == ["docker", "build"]
    assert artifact_registry_image_uri(config) in cmd


def test_build_docker_push_command_pushes_same_image_uri():
    config = DeployConfig(project_id="my-project", region="us-central1")
    push_cmd = build_docker_push_command(config)
    assert push_cmd == ["docker", "push", artifact_registry_image_uri(config)]


def test_build_gcloud_deploy_command_includes_core_flags():
    config = DeployConfig(project_id="my-project", region="us-central1", service="testflow-api")
    cmd = build_gcloud_deploy_command(config)
    assert cmd[:4] == ["gcloud", "run", "deploy", "testflow-api"]
    assert "--project" in cmd and "my-project" in cmd
    assert "--region" in cmd and "us-central1" in cmd
    assert "--image" in cmd and artifact_registry_image_uri(config) in cmd


def test_build_gcloud_deploy_command_omits_cloudsql_flag_when_not_set():
    config = DeployConfig(project_id="my-project", region="us-central1")
    cmd = build_gcloud_deploy_command(config)
    assert "--add-cloudsql-instances" not in cmd


def test_build_gcloud_deploy_command_includes_cloudsql_instance_when_set():
    config = DeployConfig(project_id="my-project", region="us-central1", cloudsql_instance="my-project:us-central1:testflow-db")
    cmd = build_gcloud_deploy_command(config)
    idx = cmd.index("--add-cloudsql-instances")
    assert cmd[idx + 1] == "my-project:us-central1:testflow-db"


def test_build_gcloud_deploy_command_formats_env_vars_sorted():
    config = DeployConfig(project_id="my-project", region="us-central1", env_vars={"B": "2", "A": "1"})
    cmd = build_gcloud_deploy_command(config)
    idx = cmd.index("--set-env-vars")
    assert cmd[idx + 1] == "A=1,B=2"


def test_build_gcloud_deploy_command_formats_secrets_with_latest_version():
    config = DeployConfig(project_id="my-project", region="us-central1", secrets={"JWT_SECRET_KEY": "jwt-secret-key"})
    cmd = build_gcloud_deploy_command(config)
    idx = cmd.index("--set-secrets")
    assert cmd[idx + 1] == "JWT_SECRET_KEY=jwt-secret-key:latest"


def test_build_all_commands_returns_build_push_deploy_in_order():
    config = DeployConfig(project_id="my-project", region="us-central1")
    commands = build_all_commands(config)
    assert len(commands) == 3
    assert commands[0][:2] == ["docker", "build"]
    assert commands[1][:2] == ["docker", "push"]
    assert commands[2][:3] == ["gcloud", "run", "deploy"]


def test_run_deploy_dry_run_prints_without_subprocess_calls(monkeypatch, capsys):
    called = []
    monkeypatch.setattr("subprocess.run", lambda *a, **k: called.append((a, k)))

    config = DeployConfig(project_id="my-project", region="us-central1")
    run_deploy(config, dry_run=True)

    assert called == []
    out = capsys.readouterr().out
    assert "[dry-run]" in out
    assert "docker build" in out


def test_run_deploy_apply_invokes_subprocess_for_each_command(monkeypatch):
    calls = []
    monkeypatch.setattr("subprocess.run", lambda cmd, **k: calls.append(cmd))

    config = DeployConfig(project_id="my-project", region="us-central1")
    run_deploy(config, dry_run=False)

    assert len(calls) == 3
    assert calls[0][:2] == ["docker", "build"]
