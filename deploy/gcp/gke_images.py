"""
Milestone 2 (GKE Autopilot) — build + push the 5 microservice images
(services/{gateway,auth,projects,runs,ai}) to Artifact Registry, ahead of
`kubectl apply -k k8s/overlays/<env>` (which references the same
REGION-docker.pkg.dev/PROJECT_ID/testflow/<service> paths — see
k8s/components/gcp-cloudsql-memorystore/kustomization.yaml).

Like deploy/gcp/cloud_run.py, this only builds argv lists / runs them;
nothing here talks to a real GCP project unless build_and_push_all() is
called with dry_run=False against an authenticated docker + gcloud.
"""
import os
import subprocess

SERVICES = ["gateway", "auth", "projects", "runs", "ai"]


def image_uri(project_id: str, region: str, service: str, tag: str) -> str:
    if service not in SERVICES:
        raise ValueError(f"unknown service {service!r}, expected one of {SERVICES}")
    return f"{region}-docker.pkg.dev/{project_id}/testflow/{service}:{tag}"


def build_command(project_id: str, region: str, service: str, tag: str) -> list[str]:
    """docker build argv — context is services/<service>, matching
    docker-compose.microservices.yml's build.context for this service."""
    return ["docker", "build", "-t", image_uri(project_id, region, service, tag), f"services/{service}"]


def push_command(project_id: str, region: str, service: str, tag: str) -> list[str]:
    return ["docker", "push", image_uri(project_id, region, service, tag)]


def build_and_push_all_commands(project_id: str, region: str, tag: str, services: list[str] | None = None) -> list[list[str]]:
    """The full build -> push sequence for every service in `services`
    (defaults to all 5), in order: each service's build immediately
    followed by its push."""
    commands = []
    for service in services or SERVICES:
        commands.append(build_command(project_id, region, service, tag))
        commands.append(push_command(project_id, region, service, tag))
    return commands


def build_and_push_all(project_id: str, region: str, tag: str, services: list[str] | None = None, dry_run: bool = True) -> None:
    for cmd in build_and_push_all_commands(project_id, region, tag, services):
        printable = " ".join(cmd)
        if dry_run:
            print(f"[dry-run] {printable}")
            continue
        print(f"$ {printable}")
        subprocess.run(cmd, check=True)


def main():
    project_id = os.environ.get("PROJECT_ID", "")
    region = os.environ.get("REGION", "us-central1")
    tag = os.environ.get("IMAGE_TAG", "latest")
    if not project_id:
        raise SystemExit("PROJECT_ID env var is required")

    apply = os.environ.get("APPLY") == "1"
    build_and_push_all(project_id, region, tag, dry_run=not apply)


if __name__ == "__main__":
    main()
