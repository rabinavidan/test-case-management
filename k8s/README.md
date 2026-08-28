# Kubernetes manifests

Kustomize `base/` + per-environment `overlays/` for the microservices stack
(`docker-compose.microservices.yml`'s five services + Postgres + Redis),
deployed as four independent environments — the same four the in-app
**Environments** dashboard (`GET /api/environments`, nav → Environments)
reports on: `staging → regression → preprod → prod`.

```
k8s/
├── base/            # Deployments/Services for gateway, auth, projects, runs, ai, db, redis
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

## What's illustrative here

This app itself runs on Vercel (see root `vercel.json`), not on a live
Kubernetes cluster — these manifests are a self-contained reference
deployment for the stack in `docker-compose.microservices.yml`, aimed at a
real target cluster (a `node-staging-1`-labeled node pool, etc.), not
something this repo's CI applies anywhere. Two things you'd replace before
using them for real:

- **Secrets** (`base/secret.yaml`, merged per-overlay via `secretGenerator`)
  are committed placeholders. Point a secret manager (Sealed Secrets,
  External Secrets Operator, Vault) at each namespace instead.
- **Image tags** (`staging`/`regression` rolling, `preprod`/`prod` pinned
  release tags) assume a CI pipeline that builds and pushes
  `testflow/{gateway,auth,projects,runs,ai}` and bumps the overlay's
  `images:` tag on promotion — that pipeline isn't part of this repo.
