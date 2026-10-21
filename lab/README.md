# Local lab — 4 environments on a 4-node Kubernetes cluster

A practice copy of the production topology that runs on one laptop, no GCP
account needed: a [kind](https://kind.sigs.k8s.io/) cluster with one worker
node per environment, and the full TestFlow stack in each.

| Node (kind worker) | Namespace | Runs |
|---|---|---|
| `testflow.io/env=staging` | `testflow-staging` | gateway, auth, projects, runs, ai, worker + Postgres, Redis, Kafka, MongoDB |
| `testflow.io/env=regression` | `testflow-regression` | same |
| `testflow.io/env=preprod` | `testflow-preprod` | same |
| `testflow.io/env=prod` | `testflow-prod` | same |

It mirrors the GKE overlays (`k8s/overlays/{staging,regression,preprod,prod}`),
which pin each environment to its own node the same way. The differences:
Postgres and Redis run in-cluster here (`k8s/base`) instead of Cloud SQL and
Memorystore, images are built locally instead of pulled from Artifact
Registry, and Kafka + MongoDB come from `k8s/components/lab-infra`.

MongoDB is infrastructure to practise against (mongosh, backups, probes) —
no TestFlow service reads `MONGO_URL` yet; everything the services persist
goes to Postgres.

## Prerequisites

Docker Desktop (Windows: WSL2 backend, run everything from a WSL shell),
`kubectl`, `kind`. Give Docker at least 4 CPUs / 12 GB for all four
environments, or bring up fewer (below).

## Up / down

```bash
lab/up.sh                       # all four environments (~10 min the first time)
lab/up.sh staging regression    # or only some
lab/health.sh staging           # exit 0 only if every workload is Ready
kubectl port-forward svc/gateway 8000:8000 -n testflow-staging   # http://localhost:8000
lab/down.sh                     # delete the cluster and all its data
```

Re-running `lab/up.sh` rebuilds the images and re-applies the manifests;
pods only restart if something changed.

## GitHub Actions + Allure

`.github/workflows/lab-deploy.yml` deploys and tests one environment from
GitHub, on a **self-hosted runner** registered on the machine running the lab:

1. Repo → Settings → Actions → Runners → *New self-hosted runner*; follow the
   steps, and when `config.sh` asks for labels add `testflow-lab`.
2. The runner machine needs Docker, kind, kubectl, Node 20 and Java 17.
3. Actions → *Lab — deploy & test (self-hosted)* → *Run workflow* → pick an
   environment.

| Environment | What the workflow runs |
|---|---|
| staging, regression | deploy → `lab/health.sh` → Playwright E2E (`lab/e2e-specs.txt`) → Allure report artifact |
| preprod, prod | deploy → `lab/health.sh` (smoke only; the real 5/minute auth rate limit stays on) |

Each run uses a GitHub Environment named `lab-<env>`; add a required reviewer
to `lab-preprod` and `lab-prod` (Settings → Environments) to gate promotion
the way a real pipeline would.

`lab/e2e-specs.txt` lists the Playwright spec files verified to pass against
the microservices deployment (65 tests). The rest of `e2e/tests` targets
monolith-only features (GraphQL, the contact form, `/api/environments`) or
behaves differently behind the gateway (live run results, CSV export), so
they aren't in the lab run.
