"""Unit tests for Milestone 3 (GCP DevOps plan) CI/CD config — parses
cloudbuild.yaml, deploy/gcp/clouddeploy.yaml, and deploy/gcp/skaffold.yaml
with PyYAML and checks their structure. No gcloud/Cloud Build/Cloud Deploy
API calls, no I/O beyond reading these repo-local files.
"""
import pathlib

import yaml

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
SERVICES = ["gateway", "auth", "projects", "runs", "ai"]


def _load_cloudbuild():
    return yaml.safe_load((REPO_ROOT / "cloudbuild.yaml").read_text())


def _load_clouddeploy():
    return list(yaml.safe_load_all((REPO_ROOT / "deploy/gcp/clouddeploy.yaml").read_text()))


def _load_skaffold():
    return yaml.safe_load((REPO_ROOT / "deploy/gcp/skaffold.yaml").read_text())


def test_cloudbuild_enforces_the_85_percent_coverage_floor():
    config = _load_cloudbuild()
    test_step = next(s for s in config["steps"] if s["id"] == "test")
    assert "--cov-fail-under=85" in test_step["args"][-1]


def test_cloudbuild_runs_lint_and_test_before_any_build_step():
    config = _load_cloudbuild()
    steps_by_id = {s["id"]: s for s in config["steps"]}
    for service in SERVICES:
        build_step = steps_by_id[f"build-{service}"]
        assert set(build_step["waitFor"]) == {"lint", "test"}


def test_cloudbuild_builds_and_pushes_every_service_image():
    config = _load_cloudbuild()
    step_ids = {s["id"] for s in config["steps"]}
    for service in SERVICES:
        assert f"build-{service}" in step_ids

    assert len(config["images"]) == len(SERVICES)
    for service in SERVICES:
        assert any(f"testflow/{service}:$SHORT_SHA" in image for image in config["images"])


def test_cloudbuild_tags_images_with_commit_sha_not_latest():
    config = _load_cloudbuild()
    for image in config["images"]:
        assert image.endswith("$SHORT_SHA")
        assert ":latest" not in image


def test_clouddeploy_defines_all_four_environments_in_promotion_order():
    docs = _load_clouddeploy()
    pipeline = next(d for d in docs if d["kind"] == "DeliveryPipeline")
    stage_targets = [s["targetId"] for s in pipeline["serialPipeline"]["stages"]]
    assert stage_targets == ["staging", "regression", "preprod", "prod"]


def test_clouddeploy_only_requires_approval_before_prod():
    docs = _load_clouddeploy()
    targets = {d["metadata"]["name"]: d for d in docs if d["kind"] == "Target"}
    assert set(targets) == {"staging", "regression", "preprod", "prod"}
    for name, target in targets.items():
        expected = name == "prod"
        assert target["requireApproval"] is expected, f"{name} requireApproval should be {expected}"


def test_skaffold_has_a_profile_per_environment_pointing_at_its_overlay():
    config = _load_skaffold()
    profiles = {p["name"]: p for p in config["profiles"]}
    assert set(profiles) == {"staging", "regression", "preprod", "prod"}
    for env, profile in profiles.items():
        paths = profile["deploy"]["kustomize"]["paths"]
        assert paths == [f"../../k8s/overlays/{env}"]


def test_skaffold_declares_an_artifact_for_every_service():
    config = _load_skaffold()
    images = {a["image"] for a in config["build"]["artifacts"]}
    assert images == {f"testflow/{service}" for service in SERVICES}
