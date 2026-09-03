"""
Milestone 1 (GCP DevOps plan) — Cloud Run deploy helper.

Builds the `gcloud`/`docker` command lines for shipping the monolith
(Dockerfile at repo root) to Cloud Run, backed by Cloud SQL and Secret
Manager. This module only *builds argv lists*; nothing here talks to a
real GCP project or subprocess unless you call run_deploy(), which shells
out to whatever `gcloud`/`docker` are on PATH and authenticated as.

Usage (against a real, authenticated gcloud + docker):
    PROJECT_ID=my-project REGION=us-central1 python -m deploy.gcp.cloud_run

See deploy/gcp/README.md for the full manual walkthrough (Artifact Registry
repo creation, Cloud SQL provisioning, secret population) this script slots
into — those one-time setup steps aren't automated here.
"""
import argparse
import os
import subprocess
from dataclasses import dataclass

DEFAULT_REPO = "testflow"
DEFAULT_SERVICE = "testflow-api"
DEFAULT_IMAGE_TAG = "latest"


@dataclass(frozen=True)
class DeployConfig:
    project_id: str
    region: str
    repo: str = DEFAULT_REPO
    service: str = DEFAULT_SERVICE
    image_tag: str = DEFAULT_IMAGE_TAG
    cloudsql_instance: str | None = None
    secrets: dict[str, str] | None = None
    env_vars: dict[str, str] | None = None

    def __post_init__(self):
        if not self.project_id:
            raise ValueError("project_id is required")
        if not self.region:
            raise ValueError("region is required")


def artifact_registry_image_uri(config: DeployConfig) -> str:
    """Build the Artifact Registry image path for this config."""
    return (
        f"{config.region}-docker.pkg.dev/{config.project_id}/"
        f"{config.repo}/{config.service}:{config.image_tag}"
    )


def build_docker_build_command(config: DeployConfig) -> list[str]:
    """docker build argv, tagging the image with its Artifact Registry URI."""
    return ["docker", "build", "-t", artifact_registry_image_uri(config), "."]


def build_docker_push_command(config: DeployConfig) -> list[str]:
    """docker push argv for the image built by build_docker_build_command()."""
    return ["docker", "push", artifact_registry_image_uri(config)]


def build_gcloud_deploy_command(config: DeployConfig) -> list[str]:
    """gcloud run deploy argv wiring the image, Cloud SQL, and Secret Manager."""
    cmd = [
        "gcloud", "run", "deploy", config.service,
        "--project", config.project_id,
        "--region", config.region,
        "--image", artifact_registry_image_uri(config),
        "--platform", "managed",
        "--allow-unauthenticated",
    ]

    if config.cloudsql_instance:
        cmd += ["--add-cloudsql-instances", config.cloudsql_instance]

    if config.env_vars:
        pairs = ",".join(f"{k}={v}" for k, v in sorted(config.env_vars.items()))
        cmd += ["--set-env-vars", pairs]

    if config.secrets:
        # e.g. JWT_SECRET_KEY=jwt-secret-key:latest — mounted as env vars from
        # Secret Manager, never baked into the image or set as plain --set-env-vars.
        pairs = ",".join(f"{k}={v}:latest" for k, v in sorted(config.secrets.items()))
        cmd += ["--set-secrets", pairs]

    return cmd


def build_all_commands(config: DeployConfig) -> list[list[str]]:
    """The full build -> push -> deploy sequence, in order."""
    return [
        build_docker_build_command(config),
        build_docker_push_command(config),
        build_gcloud_deploy_command(config),
    ]


def run_deploy(config: DeployConfig, dry_run: bool = True) -> None:
    """Execute build -> push -> deploy. dry_run=True (default) only prints the
    commands — pass dry_run=False to actually shell out (requires an
    authenticated gcloud + docker on PATH)."""
    for cmd in build_all_commands(config):
        printable = " ".join(cmd)
        if dry_run:
            print(f"[dry-run] {printable}")
            continue
        print(f"$ {printable}")
        subprocess.run(cmd, check=True)


def _config_from_env() -> DeployConfig:
    return DeployConfig(
        project_id=os.environ.get("PROJECT_ID", ""),
        region=os.environ.get("REGION", "us-central1"),
        repo=os.environ.get("ARTIFACT_REPO", DEFAULT_REPO),
        service=os.environ.get("SERVICE_NAME", DEFAULT_SERVICE),
        image_tag=os.environ.get("IMAGE_TAG", DEFAULT_IMAGE_TAG),
        cloudsql_instance=os.environ.get("CLOUDSQL_INSTANCE") or None,
        env_vars={"DATABASE_URL": os.environ["DATABASE_URL"]} if os.environ.get("DATABASE_URL") else None,
        secrets={"JWT_SECRET_KEY": "jwt-secret-key", "ANTHROPIC_API_KEY": "anthropic-api-key"},
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="actually run the commands (default: dry-run/print only)")
    args = parser.parse_args()

    config = _config_from_env()
    run_deploy(config, dry_run=not args.apply)


if __name__ == "__main__":
    main()
