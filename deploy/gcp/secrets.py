"""
Milestone 1 (GCP DevOps plan) — Secret Manager helper.

Builds the `gcloud secrets` command lines for populating JWT_SECRET_KEY and
ANTHROPIC_API_KEY (api/main.py, .env.example) into Secret Manager, so Cloud
Run pulls them at runtime instead of them living in the image or in plain
--set-env-vars. Like deploy/gcp/cloud_run.py, this only builds argv lists —
nothing here reads real secret values or talks to GCP unless you call
run_sync() with dry_run=False.
"""
import os
import subprocess

# Maps the env var name the app reads (api/main.py, .env.example) to the
# Secret Manager secret id referenced by deploy/gcp/cloud_run.py's --set-secrets.
SECRET_NAMES = {
    "JWT_SECRET_KEY": "jwt-secret-key",
    "ANTHROPIC_API_KEY": "anthropic-api-key",
}


def secret_exists_command(project_id: str, secret_id: str) -> list[str]:
    """gcloud argv to check whether a secret already exists (for scripting
    create-vs-add-version branching); exit code 0 means it exists."""
    return ["gcloud", "secrets", "describe", secret_id, "--project", project_id]


def build_create_secret_command(project_id: str, secret_id: str) -> list[str]:
    """gcloud argv to create a new, empty secret container (no value yet)."""
    return [
        "gcloud", "secrets", "create", secret_id,
        "--project", project_id,
        "--replication-policy", "automatic",
    ]


def build_add_version_command(project_id: str, secret_id: str) -> list[str]:
    """gcloud argv to add a new version from stdin — call with input=value.encode()
    via subprocess.run so the secret value never appears in argv/process listing."""
    return [
        "gcloud", "secrets", "versions", "add", secret_id,
        "--project", project_id,
        "--data-file", "-",
    ]


def sync_secret(project_id: str, secret_id: str, value: str, dry_run: bool = True) -> None:
    """Create the secret if needed, then add a new version with `value`."""
    exists_cmd = secret_exists_command(project_id, secret_id)
    create_cmd = build_create_secret_command(project_id, secret_id)
    add_version_cmd = build_add_version_command(project_id, secret_id)

    if dry_run:
        print(f"[dry-run] {' '.join(exists_cmd)}  # if non-zero exit:")
        print(f"[dry-run]   {' '.join(create_cmd)}")
        print(f"[dry-run] {' '.join(add_version_cmd)} < <secret value>")
        return

    exists = subprocess.run(exists_cmd, capture_output=True, check=False).returncode == 0
    if not exists:
        subprocess.run(create_cmd, check=True)
    subprocess.run(add_version_cmd, input=value.encode(), check=True)


def run_sync(project_id: str, values: dict[str, str], dry_run: bool = True) -> None:
    """Sync every secret in `values` (keyed by app env var name, e.g. JWT_SECRET_KEY)
    to its Secret Manager id from SECRET_NAMES."""
    for env_var, value in values.items():
        secret_id = SECRET_NAMES[env_var]
        sync_secret(project_id, secret_id, value, dry_run=dry_run)


def main():
    project_id = os.environ.get("PROJECT_ID", "")
    if not project_id:
        raise SystemExit("PROJECT_ID env var is required")

    values = {name: os.environ[name] for name in SECRET_NAMES if os.environ.get(name)}
    if not values:
        raise SystemExit(f"Set at least one of {list(SECRET_NAMES)} in the environment before running.")

    apply = os.environ.get("APPLY") == "1"
    run_sync(project_id, values, dry_run=not apply)


if __name__ == "__main__":
    main()
