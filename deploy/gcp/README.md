# GCP DevOps Milestone 1 — Artifact Registry + Cloud Run

Ships the monolith (`Dockerfile` at repo root) to a live Cloud Run URL,
backed by Cloud SQL (PostgreSQL 16) and Secret Manager. Tracks
[Milestone 1 of the GCP DevOps practice plan](../../docs) (issue #175).

## What's here

| File | Purpose |
|---|---|
| `cloud_run.py` | Builds `docker build`/`push` + `gcloud run deploy` argv; `run_deploy()` executes them (dry-run by default) |
| `secrets.py` | Builds `gcloud secrets` argv to sync `JWT_SECRET_KEY`/`ANTHROPIC_API_KEY` into Secret Manager |
| `cloud-run-service.yaml` | Reference Knative service spec — the same shape `gcloud run deploy` produces, useful for `gcloud run services replace` or reviewing the target state |

As with `k8s/` (see its README), these are automation for a *real* target
project — nothing here is applied by this repo's CI. `deploy/gcp/*.py` are
covered by unit tests (`tests/unit/test_gcp_cloud_run_deploy.py`,
`tests/unit/test_gcp_secrets.py`) that check the command-building logic
only; no test talks to a real GCP project.

## One-time setup (manual, per Milestone 1 tasks)

```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  sqladmin.googleapis.com secretmanager.googleapis.com

# Artifact Registry repo
gcloud artifacts repositories create testflow \
  --repository-format=docker --location=REGION

# Cloud SQL (PostgreSQL 16)
gcloud sql instances create testflow-db --database-version=POSTGRES_16 \
  --tier=db-f1-micro --region=REGION
gcloud sql databases create testflow --instance=testflow-db
gcloud sql users create testflow --instance=testflow-db --password=CHANGEME
```

## Populate secrets

```bash
PROJECT_ID=my-project \
JWT_SECRET_KEY=$(openssl rand -hex 32) \
ANTHROPIC_API_KEY=sk-ant-... \
APPLY=1 python -m deploy.gcp.secrets
```

Omit `APPLY=1` to see the `gcloud` commands without running them.

## Build, push, deploy

```bash
PROJECT_ID=my-project \
REGION=us-central1 \
CLOUDSQL_INSTANCE=my-project:us-central1:testflow-db \
DATABASE_URL="postgresql://testflow:CHANGEME@/testflow?host=/cloudsql/my-project:us-central1:testflow-db" \
python -m deploy.gcp.cloud_run --apply
```

Omit `--apply` to print the `docker build`/`push`/`gcloud run deploy`
commands without running them.

## Verify

```bash
SERVICE_URL=$(gcloud run services describe testflow-api --region=REGION --format='value(status.url)')
curl -s "$SERVICE_URL" | head -1        # confirm the app responds
# register/login/create-project through the UI at $SERVICE_URL
# open a WebSocket client against $SERVICE_URL/ws/... to confirm real-time run updates
```
