"""Static checks that every microservice is ready for Datadog
(docs/datadog.md): it runs under ddtrace-run, pins the same ddtrace, and the
Compose stack names each service, points it at the Agent, and keeps tracing
and the Agent itself off unless asked. No Docker or network needed — the
rendered Kubernetes side is tests/infra/test_k8s_datadog.py."""
import pathlib
import re

import pytest
import yaml

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
SERVICES = ["gateway", "auth", "projects", "runs", "ai", "worker"]
COMPOSE = REPO_ROOT / "docker-compose.microservices.yml"
DOCKERFILES = sorted((REPO_ROOT / "services").glob("*/Dockerfile*"))


def test_every_service_dockerfile_is_found():
    assert {p.parent.name for p in DOCKERFILES} == set(SERVICES)


@pytest.mark.parametrize("dockerfile", DOCKERFILES, ids=lambda p: f"{p.parent.name}/{p.name}")
def test_every_service_runs_under_ddtrace_run(dockerfile):
    [cmd] = [line for line in dockerfile.read_text().splitlines() if line.startswith("CMD ")]
    assert cmd.startswith('CMD ["ddtrace-run", '), cmd


def test_every_service_pins_the_same_ddtrace():
    pins = {}
    for service in SERVICES:
        text = (REPO_ROOT / "services" / service / "requirements.txt").read_text()
        [pin] = re.findall(r"^ddtrace==(\S+)$", text, re.M)
        pins[service] = pin
    assert len(set(pins.values())) == 1, pins


@pytest.fixture(scope="module")
def compose():
    return yaml.safe_load(COMPOSE.read_text())


@pytest.mark.parametrize("service", SERVICES)
def test_compose_service_is_named_and_points_at_the_agent(compose, service):
    env = compose["services"][service]["environment"]
    assert env["DD_SERVICE"] == service
    assert env["DD_AGENT_HOST"] == "datadog-agent"
    assert env["DD_TRACE_ENABLED"] == "${DD_TRACE_ENABLED:-false}"  # off unless asked
    assert env["DD_LOGS_INJECTION"] == "true"


def test_compose_agent_only_starts_with_the_datadog_profile(compose):
    agent = compose["services"]["datadog-agent"]
    assert agent["profiles"] == ["datadog"]
    assert agent["environment"]["DD_API_KEY"] == "${DD_API_KEY:-}"  # never a key in the repo
    assert agent["environment"]["DD_APM_NON_LOCAL_TRAFFIC"] == "true"
    assert agent["environment"]["DD_LOGS_CONFIG_CONTAINER_COLLECT_ALL"] == "true"
    for service in SERVICES:
        assert "datadog-agent" not in (compose["services"][service].get("depends_on") or {})
