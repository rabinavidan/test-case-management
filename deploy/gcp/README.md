# GCP DevOps Milestones 1-3 — Cloud Run, GKE Autopilot, then CI/CD

> Milestone 4 (Terraform — provisioning everything below as code) lives in
> [`terraform/`](../../terraform/README.md), not here.

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

---

## Milestone 2 — GKE Autopilot (microservices)

Deploys the 5-service mode (`docker-compose.microservices.yml`) to GKE
Autopilot across the four `k8s/overlays/` environments, backed by Cloud SQL
and Memorystore instead of in-cluster Postgres/Redis. See `k8s/README.md`
("GKE Autopilot + Cloud SQL + Memorystore") for what
`k8s/components/gcp-cloudsql-memorystore/` changes relative to `base/`.

### One-time setup

```bash
gcloud container clusters create-auto testflow-gke --region=REGION

gcloud redis instances create testflow-redis --region=REGION \
  --tier=basic --size=1
MEMORYSTORE_HOST=$(gcloud redis instances describe testflow-redis --region=REGION --format='value(host)')

# Workload Identity: a GSA the Cloud SQL Auth Proxy sidecar impersonates —
# no static key ever touches the cluster.
gcloud iam service-accounts create cloudsql-proxy-gsa
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:cloudsql-proxy-gsa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
gcloud iam service-accounts add-iam-policy-binding \
  cloudsql-proxy-gsa@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:PROJECT_ID.svc.id.goog[testflow-staging/cloudsql-proxy]"
  # repeat --member for each namespace: testflow-{staging,regression,preprod,prod}
```

### Build + push all 5 images

```bash
PROJECT_ID=my-project REGION=us-central1 IMAGE_TAG=staging \
APPLY=1 python -m deploy.gcp.gke_images
```

Omit `APPLY=1` to print the commands without running them.

### Substitute placeholders and deploy

Replace `PROJECT_ID`, `REGION`, `CLOUDSQL_INSTANCE`, `MEMORYSTORE_HOST`, and
`WORKLOAD_IDENTITY_GSA` in `k8s/overlays/<env>/kustomization.yaml` and
`k8s/components/gcp-cloudsql-memorystore/` (or pipe through `sed`), then:

```bash
kubectl kustomize k8s/overlays/staging   # render, sanity-check first
kubectl apply -k k8s/overlays/staging
kubectl get pods -n testflow-staging     # confirm every pod is Running/Ready
```

Repeat for `regression`, `preprod`, `prod`.

### Verify

```bash
kubectl get svc gateway -n testflow-staging          # gateway is the only Service exposed via Ingress
kubectl logs -n testflow-staging deploy/auth -c cloud-sql-proxy   # confirm the sidecar connected
# Graceful degradation: temporarily point Memorystore's firewall rule away from
# the cluster (or scale the instance down) and confirm the gateway still serves
# (runs pub/sub degrades, the rest of the app doesn't) — see runs/events.py.
```

---

## Milestone 3 — CI/CD the GCP way

Automates build -> test -> push -> promote with `cloudbuild.yaml` (repo
root) and Cloud Deploy (`deploy/gcp/clouddeploy.yaml` +
`deploy/gcp/skaffold.yaml`), promoting one release through the same four
environments as `k8s/overlays/`, with a manual approval gate before prod.
`tests/unit/test_gcp_cicd_config.py` parses and structurally validates all
three config files (coverage gate present, correct stage order, approval
only on prod, a profile/artifact per service) — it doesn't call any GCP
API, so it runs in this repo's own GitHub Actions CI on every PR that
touches these files.

### One-time setup

```bash
# Cloud Build trigger — fires cloudbuild.yaml on push to main and on PR
gcloud builds triggers create github \
  --repo-name=test-case-management --repo-owner=rabinavidan \
  --branch-pattern="^main$" --build-config=cloudbuild.yaml \
  --name=testflow-main
gcloud builds triggers create github \
  --repo-name=test-case-management --repo-owner=rabinavidan \
  --pull-request-pattern=".*" --build-config=cloudbuild.yaml \
  --name=testflow-pr

# Cloud Deploy pipeline + its 4 targets (needs the GKE cluster from Milestone 2)
gcloud deploy apply --file=deploy/gcp/clouddeploy.yaml --region=REGION
```

Substitute `PROJECT_ID`/`REGION` in `deploy/gcp/clouddeploy.yaml` first (same placeholders as Milestone 2).

### Trigger a run and promote

```bash
# A push to main (or `gcloud builds submit --config=cloudbuild.yaml`) runs
# lint -> test (85% coverage gate) -> build -> push for all 5 images.

# Kick off a release, deploying to the first target (staging) automatically:
gcloud deploy releases create testflow-$(git rev-parse --short HEAD) \
  --delivery-pipeline=testflow-pipeline --region=REGION \
  --source=deploy/gcp \
  --images=testflow/gateway=REGION-docker.pkg.dev/PROJECT_ID/testflow/gateway:$(git rev-parse --short HEAD),testflow/auth=...,testflow/projects=...,testflow/runs=...,testflow/ai=...

# Promote through regression -> preprod once each stage looks good:
gcloud deploy releases promote --delivery-pipeline=testflow-pipeline --region=REGION

# prod requires approval (clouddeploy.yaml's requireApproval: true) —
# approve explicitly:
gcloud deploy rollouts approve ROLLOUT_ID \
  --delivery-pipeline=testflow-pipeline --release=RELEASE_ID --region=REGION
```
