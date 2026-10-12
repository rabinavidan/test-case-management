"""Infra tests for Milestone 2 (GKE Autopilot) — render every k8s/overlays/*
kustomization with the real `kubectl kustomize` binary and check the
GCP wiring (k8s/components/gcp-cloudsql-memorystore) came out right:
Artifact Registry image names, the in-cluster db/redis removed, the
Cloud SQL Auth Proxy sidecar injected on auth/projects/runs, and Memorystore
wired into REDIS_URL.

Requires `kubectl` on PATH (CI installs it — see .github/workflows/test.yml's
"Infra (k8s manifests)" job); skipped locally if it's missing.
"""
import pathlib
import shutil
import subprocess

import pytest
import yaml

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
OVERLAYS = ["staging", "regression", "preprod", "prod"]

pytestmark = pytest.mark.skipif(shutil.which("kubectl") is None, reason="kubectl not installed")


def _render(overlay: str) -> list[dict]:
    result = subprocess.run(
        ["kubectl", "kustomize", f"k8s/overlays/{overlay}"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return list(yaml.safe_load_all(result.stdout))


@pytest.mark.parametrize("overlay", OVERLAYS)
def test_overlay_builds_cleanly(overlay):
    docs = _render(overlay)
    assert docs, f"{overlay} produced no manifests"


@pytest.mark.parametrize("overlay", OVERLAYS)
def test_overlay_uses_artifact_registry_images(overlay):
    docs = _render(overlay)
    deployments = {d["metadata"]["name"]: d for d in docs if d["kind"] == "Deployment"}
    for service in ["gateway", "auth", "projects", "runs", "ai", "worker"]:
        image = deployments[service]["spec"]["template"]["spec"]["containers"][0]["image"]
        assert "-docker.pkg.dev/" in image, f"{service} in {overlay} not pointed at Artifact Registry: {image}"


@pytest.mark.parametrize("overlay", OVERLAYS)
def test_overlay_drops_in_cluster_db_and_redis(overlay):
    docs = _render(overlay)
    names_by_kind = {}
    for d in docs:
        names_by_kind.setdefault(d["kind"], set()).add(d["metadata"]["name"])
    assert "db" not in names_by_kind.get("StatefulSet", set())
    assert "redis" not in names_by_kind.get("Deployment", set())


@pytest.mark.parametrize("overlay", OVERLAYS)
def test_overlay_injects_cloud_sql_proxy_sidecar_on_db_backed_services(overlay):
    docs = _render(overlay)
    deployments = {d["metadata"]["name"]: d for d in docs if d["kind"] == "Deployment"}

    for service in ["auth", "projects", "runs", "worker"]:
        containers = deployments[service]["spec"]["template"]["spec"]["containers"]
        sidecar_names = {c["name"] for c in containers}
        assert "cloud-sql-proxy" in sidecar_names, f"{service} in {overlay} missing cloud-sql-proxy sidecar"
        assert deployments[service]["spec"]["template"]["spec"]["serviceAccountName"] == "cloudsql-proxy"

    # ai and gateway don't talk to Postgres — no sidecar expected.
    for service in ["ai", "gateway"]:
        containers = deployments[service]["spec"]["template"]["spec"]["containers"]
        assert len(containers) == 1, f"{service} in {overlay} unexpectedly has a sidecar"


@pytest.mark.parametrize("overlay", OVERLAYS)
def test_overlay_points_redis_url_at_memorystore(overlay):
    docs = _render(overlay)
    configmap = next(d for d in docs if d["kind"] == "ConfigMap" and d["metadata"]["name"].startswith("testflow-config"))
    assert configmap["data"]["REDIS_URL"] == "redis://MEMORYSTORE_HOST:6379"


HTTP_SERVICE_PORTS = {"auth": 8001, "projects": 8002, "runs": 8003, "ai": 8004}


@pytest.mark.parametrize("overlay", OVERLAYS)
def test_overlay_http_services_split_liveness_from_readiness(overlay):
    """Liveness must hit a dependency-free endpoint (a DB outage restarting
    every replica at once is the failure this split exists to prevent);
    readiness hits the one that checks the database. See
    services/common/health.py."""
    docs = _render(overlay)
    deployments = {d["metadata"]["name"]: d for d in docs if d["kind"] == "Deployment"}
    for service, port in HTTP_SERVICE_PORTS.items():
        container = deployments[service]["spec"]["template"]["spec"]["containers"][0]
        for probe, path in [("startupProbe", "/health/live"),
                            ("livenessProbe", "/health/live"),
                            ("readinessProbe", "/health/ready")]:
            assert container[probe]["httpGet"] == {"path": path, "port": port}, (
                f"{service} in {overlay}: {probe} should GET {path} on {port}"
            )


@pytest.mark.parametrize("overlay", OVERLAYS)
def test_overlay_worker_has_heartbeat_liveness_probe(overlay):
    docs = _render(overlay)
    worker = next(d for d in docs if d["kind"] == "Deployment" and d["metadata"]["name"] == "worker")
    command = worker["spec"]["template"]["spec"]["containers"][0]["livenessProbe"]["exec"]["command"]
    assert command[:3] == ["python", "-m", "services.common.heartbeat"]
