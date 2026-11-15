# Kubernetes manifests

Kustomize `base/` + per-environment `overlays/` for the microservices stack
(`docker-compose.microservices.yml`'s five services + Postgres + Redis),
deployed as four independent environments on a local [kind](https://kind.sigs.k8s.io/)
cluster — the same four the in-app **Environments** dashboard
(`GET /api/environments`, nav → Environments) reports on:
`staging → regression → preprod → prod`. See [`lab/README.md`](../lab/README.md)
to bring the cluster up.

```
k8s/
├── base/                 # Deployments/Services for gateway, auth, projects, runs, ai, db, redis
│                         # + worker (Deployment only, no Service — no HTTP port)
├── components/lab-infra/ # in-cluster Kafka + MongoDB added on top of base
└── overlays/lab/
    ├── staging/
    ├── regression/
    ├── preprod/
    └── prod/
```

Each overlay sets:

| | namespace | node (`nodeSelector: testflow.io/env`) | auth rate limit | image tag |
|---|---|---|---|---|
| staging    | `testflow-staging`    | the kind worker labelled `staging`    | relaxed (full E2E suite runs here) | `lab` |
| regression | `testflow-regression` | the kind worker labelled `regression` | relaxed (full E2E suite runs here) | `lab` |
| preprod    | `testflow-preprod`    | the kind worker labelled `preprod`    | real 5/min (smoke checks only) | `lab` |
| prod       | `testflow-prod`       | the kind worker labelled `prod`       | real 5/min (smoke checks only) | `lab` |

`lab/kind-config.yaml` creates one worker per environment with that label,
so every workload of an environment lands on its own node — the same
four-environments-four-nodes topology the in-app Environments dashboard
reports (seeded by `_seed_environments` in `api/main.py`).

## Health probes

| Workload | `startupProbe` | `livenessProbe` (restart) | `readinessProbe` (traffic) |
|---|---|---|---|
| auth · projects · runs · ai | `GET /health/live` (up to 2 min to boot) | `GET /health/live` | `GET /health/ready` — checks the DB, 503 when down |
| gateway | — | `GET /api/version` | `GET /api/version` |
| worker (no HTTP port) | — | exec `python -m services.common.heartbeat /tmp/worker-heartbeat 60` | — |

Liveness never checks a dependency on purpose: a database outage should pull
pods out of the Service (readiness), not restart every replica at once in a
loop (liveness). The worker's consume loop touches the heartbeat file on every
iteration — including while it retries a Redis outage — so the probe only
fires for a loop that has wedged without crashing. Details in
[`services/README.md`](../services/README.md#health-checks-liveness-vs-readiness);
`tests/infra/test_k8s_lab_overlays.py` checks every rendered overlay keeps
this wiring.

## Building / applying

```bash
kubectl kustomize k8s/overlays/lab/staging   # render, sanity-check before applying
lab/up.sh staging                            # build images, load them into kind, apply
```

`tests/infra/` renders all four overlays with the real `kubectl kustomize`
in CI and checks node pinning, probes, Datadog wiring and per-environment
rate limits.

## What's illustrative here

The public demo runs on Vercel (root `vercel.json`); these manifests run the
microservices stack on the local kind lab, not on a hosted cluster. Before
pointing them at a real one, replace:

- **Secrets** (`base/secret.yaml`, merged per-overlay via `secretGenerator`)
  are committed placeholders. Point a secret manager (Sealed Secrets,
  External Secrets Operator, Vault) at each namespace instead.
- **Images** are the locally built `testflow/*:lab` tags `lab/up.sh` loads
  into kind; a real cluster needs a registry and a CI step that pushes to it.
