# Kubernetes manifests

Kustomize `base/` + per-environment `overlays/` for the microservices stack
(`docker-compose.microservices.yml`'s five services + Postgres + Redis),
deployed as four independent environments — the same four the in-app
**Environments** dashboard (`GET /api/environments`, nav → Environments)
reports on: `staging → regression → preprod → prod`.

```
k8s/
├── base/            # Deployments/Services for gateway, auth, projects, runs, ai, db, redis
│                    # + worker (Deployment only, no Service — no HTTP port)
└── overlays/
    ├── staging/
    ├── regression/
    ├── preprod/
    └── prod/
```

Each overlay sets:

| | namespace | node (`nodeSelector: kubernetes.io/hostname`) | replicas (gateway/runs) | image tag |
|---|---|---|---|---|
| staging    | `testflow-staging`    | `node-staging-1`    | 1 / 1 | `staging` (rolling) |
| regression | `testflow-regression` | `node-regression-1` | 1 / 1 | `regression` (rolling) |
| preprod    | `testflow-preprod`    | `node-preprod-1`    | 2 / 2 | pinned release-candidate tag |
| prod       | `testflow-prod`       | `node-prod-1`       | 3 / 3 | pinned release tag |

The `node-*` hostnames match `node_name` in the app's seeded `environments`
table (`api/models.py::Environment`, seeded by `_seed_environments` in
`api/main.py`) — the dashboard and these manifests describe the same
topology. Pinning every workload for an environment to one named node via
`nodeSelector` (rather than a shared pool) mirrors the constraint the task
started from: four environments, each on its own specific node.

## Building / applying

```bash
kubectl kustomize k8s/overlays/staging      # render, sanity-check before applying
kubectl apply -k k8s/overlays/staging       # apply to a real cluster
```

## GKE Autopilot + Cloud SQL + Memorystore (Milestone 2)

Every overlay opts into `components/gcp-cloudsql-memorystore/` (a kustomize
[Component](https://kubectl.docs.kubernetes.io/guides/config_management/components/)),
which — on top of `base/` — points every image at Artifact Registry, swaps
the in-cluster `db`/`redis` for Cloud SQL (via a Cloud SQL Auth Proxy
sidecar on `auth`/`projects`/`runs`, authenticated through Workload Identity
— no static service-account key) and Memorystore. See
`deploy/gcp/gke_images.py` for building/pushing the 5 service images, and
`deploy/gcp/README.md` for the full GKE walkthrough. `tests/infra/` renders
all four overlays with the real `kubectl kustomize` binary in CI and checks
this wiring.

## What's illustrative here

This app itself runs on Vercel (see root `vercel.json`), not on a live
Kubernetes cluster — these manifests are a self-contained reference
deployment for the stack in `docker-compose.microservices.yml`, aimed at a
real target cluster (a `node-staging-1`-labeled node pool, a real GKE
Autopilot cluster, etc.), not something this repo's CI applies anywhere.
Things you'd replace before using them for real:

- **Secrets** (`base/secret.yaml`, merged per-overlay via `secretGenerator`)
  are committed placeholders. Point a secret manager (Sealed Secrets,
  External Secrets Operator, Vault, or GCP Secret Manager per
  `deploy/gcp/secrets.py`) at each namespace instead.
- **Image tags** (`staging`/`regression` rolling, `preprod`/`prod` pinned
  release tags) assume a CI pipeline that builds and pushes
  `testflow/{gateway,auth,projects,runs,ai}` and bumps the overlay's
  `images:` tag on promotion — that pipeline isn't part of this repo.
- **GCP placeholders** (`PROJECT_ID`, `REGION`, `CLOUDSQL_INSTANCE`,
  `MEMORYSTORE_HOST`, `WORKLOAD_IDENTITY_GSA`) in the images list and in
  `components/gcp-cloudsql-memorystore/` are literal strings, not real
  values — `kubectl kustomize` renders them as-is; substitute your real
  project's values before `kubectl apply -k`.
