"""Infra tests for the local kind lab (lab/README.md) — render every
k8s/overlays/lab/* with the real `kubectl kustomize` and check it matches the
cluster it's meant for (lab/kind-config.yaml): one worker per environment,
every workload pinned to its own environment's worker, Kafka + MongoDB added
on top of base's Postgres + Redis.

Requires `kubectl` on PATH (CI installs it); skipped locally if it's missing.
"""
import pathlib
import shutil
import subprocess

import pytest
import yaml

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
ENVS = ["staging", "regression", "preprod", "prod"]

pytestmark = pytest.mark.skipif(shutil.which("kubectl") is None, reason="kubectl not installed")


def _render(env: str) -> list[dict]:
    result = subprocess.run(
        ["kubectl", "kustomize", f"k8s/overlays/lab/{env}"],
        cwd=REPO_ROOT, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    return [d for d in yaml.safe_load_all(result.stdout) if d]


def _workloads(docs: list[dict]) -> dict[str, dict]:
    return {d["metadata"]["name"]: d for d in docs if d["kind"] in ("Deployment", "StatefulSet")}


def _config(docs: list[dict]) -> dict:
    return next(d for d in docs if d["kind"] == "ConfigMap" and d["metadata"]["name"].startswith("testflow-config"))["data"]


def test_kind_config_has_one_labelled_worker_per_environment():
    config = yaml.safe_load((REPO_ROOT / "lab/kind-config.yaml").read_text())
    workers = [n for n in config["nodes"] if n["role"] == "worker"]
    assert sorted(n["labels"]["testflow.io/env"] for n in workers) == sorted(ENVS)


@pytest.mark.parametrize("env", ENVS)
def test_every_workload_is_pinned_to_its_environments_worker(env):
    for name, w in _workloads(_render(env)).items():
        assert w["spec"]["template"]["spec"].get("nodeSelector") == {"testflow.io/env": env}, name


@pytest.mark.parametrize("env", ENVS)
def test_lab_runs_the_full_stack_in_its_own_namespace(env):
    docs = _render(env)
    assert set(_workloads(docs)) == {
        "gateway", "auth", "projects", "runs", "ai", "worker", "db", "redis", "kafka", "mongo",
    }
    assert {d["metadata"].get("namespace") for d in docs if d["kind"] != "Namespace"} == {f"testflow-{env}"}
    config = _config(docs)
    assert config["ENVIRONMENT"] == env
    assert config["KAFKA_BOOTSTRAP_SERVERS"] == "kafka:9092"


@pytest.mark.parametrize("env", ENVS)
def test_kafka_disables_service_links(env):
    """Without this, Kubernetes injects KAFKA_PORT=tcp://... from the `kafka`
    Service itself, which the apache/kafka image reads as a broker setting."""
    kafka = _workloads(_render(env))["kafka"]
    assert kafka["spec"]["template"]["spec"]["enableServiceLinks"] is False


@pytest.mark.parametrize("env", ENVS)
def test_lab_images_are_the_locally_loaded_tag(env):
    for name, w in _workloads(_render(env)).items():
        image = w["spec"]["template"]["spec"]["containers"][0]["image"]
        if image.startswith("testflow/"):
            assert image.endswith(":lab"), f"{name}: {image}"


@pytest.mark.parametrize("env,disabled", [("staging", True), ("regression", True), ("preprod", False), ("prod", False)])
def test_auth_rate_limit_is_only_relaxed_where_the_full_e2e_suite_runs(env, disabled):
    assert (_config(_render(env)).get("TESTFLOW_DISABLE_RATE_LIMIT") == "1") is disabled
