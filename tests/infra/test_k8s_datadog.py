"""Infra tests for the Datadog wiring (docs/datadog.md): render every GKE
overlay with the real `kubectl kustomize` and check each app Deployment
reaches the node-local Agent, names itself, and stays off until an overlay
turns tracing on.

Requires `kubectl` on PATH (CI installs it); skipped locally if missing.
"""
import pathlib
import shutil
import subprocess

import pytest
import yaml

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
OVERLAYS = ["staging", "regression", "preprod", "prod"]
APP_SERVICES = ["gateway", "auth", "projects", "runs", "ai", "worker"]

pytestmark = pytest.mark.skipif(shutil.which("kubectl") is None, reason="kubectl not installed")


def _render(overlay: str) -> list[dict]:
    result = subprocess.run(["kubectl", "kustomize", f"k8s/overlays/{overlay}"],
                            cwd=REPO_ROOT, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return [d for d in yaml.safe_load_all(result.stdout) if d]


def _config(docs: list[dict]) -> dict:
    [cm] = [d for d in docs if d["kind"] == "ConfigMap" and d["metadata"]["name"].startswith("testflow-config")]
    return cm["data"]


@pytest.mark.parametrize("overlay", OVERLAYS)
def test_tracing_is_off_by_default_with_the_overlays_env(overlay):
    config = _config(_render(overlay))
    assert config["DD_TRACE_ENABLED"] == "false"
    assert config["DD_RUNTIME_METRICS_ENABLED"] == "false"
    assert config["DD_LOGS_INJECTION"] == "true"
    assert config["DD_ENV"] == overlay


@pytest.mark.parametrize("overlay", OVERLAYS)
def test_every_app_deployment_names_itself_and_finds_the_node_agent(overlay):
    deployments = {d["metadata"]["name"]: d for d in _render(overlay) if d["kind"] == "Deployment"}
    for service in APP_SERVICES:
        template = deployments[service]["spec"]["template"]
        [app] = [c for c in template["spec"]["containers"] if c["name"] == service]
        env = {e["name"]: e for e in app["env"]}
        assert env["DD_SERVICE"]["value"] == service
        assert env["DD_AGENT_HOST"]["valueFrom"] == {"fieldRef": {"fieldPath": "status.hostIP"}}
        # DD_TRACE_ENABLED / DD_ENV / DD_LOGS_INJECTION arrive through testflow-config.
        assert any(r.get("configMapRef", {}).get("name", "").startswith("testflow-config") for r in app["envFrom"])
        assert template["metadata"]["labels"]["tags.datadoghq.com/service"] == service
        logs = yaml.safe_load(template["metadata"]["annotations"][f"ad.datadoghq.com/{service}.logs"])
        assert logs == [{"source": "python", "service": service}]


def test_agent_helm_values_expose_the_ports_the_services_expect():
    values = yaml.safe_load((REPO_ROOT / "deploy/datadog/values.yaml").read_text())
    dd = values["datadog"]
    assert dd["apiKeyExistingSecret"] == "datadog-secret"  # never a key in the repo
    assert "apiKey" not in dd
    assert dd["apm"]["portEnabled"] is True               # DD_AGENT_HOST=status.hostIP -> hostPort 8126
    assert dd["logs"] == {"enabled": True, "containerCollectAll": True}
    assert values["providers"]["gke"]["autopilot"] is True
