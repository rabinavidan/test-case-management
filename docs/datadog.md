# Datadog for the microservices

Every microservice (gateway, auth, projects, runs, ai, worker) is wired for
Datadog APM, logs and log↔trace correlation, **switched off by default**:
nothing is traced or sent until you set `DD_TRACE_ENABLED=true` and run a
Datadog Agent. No API key lives in the repo.

| Piece | Where | What it does |
|---|---|---|
| `ddtrace-run` | every `services/*/Dockerfile` `CMD` | Auto-instruments FastAPI, SQLAlchemy, httpx, Redis, Kafka; propagates trace headers on service-to-service httpx calls, so one request through gateway → runs → projects is one trace |
| `ddtrace==4.16.0` | every `services/*/requirements.txt` | Same pinned version in all six (`tests/unit/test_datadog_wiring.py`) |
| JSON log formatter | `services/common/logging_config.py` | One valid JSON object per line (`time`, `level`, `service`, `logger`, `msg`); adds `dd.trace_id`/`dd.span_id` inside a span and `error.kind/message/stack` for exceptions |
| Compose | `docker-compose.microservices.yml` | `x-datadog-env` on every service; `datadog-agent` under the `datadog` profile |
| Kubernetes | `k8s/base/*.yaml`, `configmap.yaml`, overlays | `DD_SERVICE`, `DD_AGENT_HOST=status.hostIP`, `tags.datadoghq.com/service` label, log annotation; `DD_TRACE_ENABLED`/`DD_ENV` in `testflow-config` |
| Agent | `deploy/datadog/values.yaml` | Helm values for the official chart (GKE Autopilot mode, APM hostPort 8126, logs from all containers) |

## Switching it on

### Locally — Docker Compose

```bash
export DD_API_KEY=...            # Datadog → Organization Settings → API Keys
export DD_SITE=datadoghq.com     # or datadoghq.eu, us3.datadoghq.com, ...
DD_TRACE_ENABLED=true DD_ENV=local \
  docker compose -f docker-compose.microservices.yml --profile datadog up --build
```

Without `--profile datadog` the Agent doesn't start, and without
`DD_TRACE_ENABLED=true` the services don't trace — the stack behaves exactly
as before (this is what `microservices-smoke.yml` runs in CI).

### GKE

1. Install the Agent (once per cluster):
   ```bash
   helm repo add datadog https://helm.datadoghq.com
   kubectl create namespace datadog
   kubectl -n datadog create secret generic datadog-secret --from-literal api-key="$DD_API_KEY"
   helm upgrade --install datadog datadog/datadog -n datadog -f deploy/datadog/values.yaml
   ```
   Change `datadog.site` in the values file first if you're not on US1.
2. Turn tracing on in the overlay — e.g. `k8s/overlays/prod/kustomization.yaml`:
   ```yaml
   configMapGenerator:
     - name: testflow-config
       behavior: merge
       literals:
         - ENVIRONMENT=prod
         - DD_ENV=prod
         - DD_TRACE_ENABLED=true
         - DD_RUNTIME_METRICS_ENABLED=true
   ```
3. Deploy as usual. Pods pick the new ConfigMap up on their next rollout.

How traces reach the Agent: each pod gets `DD_AGENT_HOST` = its node's IP
(`status.hostIP`), and the Agent DaemonSet listens on hostPort 8126 there.
Checked with `helm template` against chart `datadog/datadog` 3.261.0 that
hostPort 8126 is kept in Autopilot mode. The chart also creates a node-local
`datadog` Service; to use it instead, add
`DD_TRACE_AGENT_URL=http://datadog.datadog.svc.cluster.local:8126` to
`testflow-config` (it overrides `DD_AGENT_HOST`).

## What you get

- **APM → Service Map**: gateway → auth / projects / runs / ai, runs →
  Redis / Kafka → worker, with latency, throughput and error rate per edge.
- **Traces**: one `PUT /api/runs/{id}/results/{tc}` end to end, including the
  SQL it ran and the Redis publish that fans the update out.
- **Logs**: every pod's stdout, already JSON, tagged `service` / `env`; from a
  trace, *View related logs* works because each line inside a request carries
  `dd.trace_id`.
- **Runtime metrics** (when `DD_RUNTIME_METRICS_ENABLED=true`): CPU, memory,
  GC, threads per service.

## Checking it works

1. Send a few requests through the gateway (`/api/projects`, a run update).
2. Datadog → **APM → Services**: six services, tagged with your `env`.
3. **Logs**: `service:runs` — open a line with a `dd.trace_id` and jump to its trace.
4. Locally, without Datadog: run a service under `ddtrace-run` with
   `DD_TRACE_ENABLED=true` and watch its log lines gain a `dd` object.

## Not covered (yet)

- **The monolith** (`api/`, deployed to Vercel) isn't wrapped: Vercel's
  serverless runtime has no place for an Agent. Datadog's Vercel integration
  (log drains) or agentless LLM Observability are the options there.
- **Custom business metrics** (DogStatsD: AI cost, triage verdicts, WebSocket
  connections) — the Agent already listens on 8125; the services don't emit
  any yet.
- **Monitors and dashboards as code** — the Datadog Terraform provider would
  sit next to `terraform/modules/monitoring` (which does the same for GCP).
- **CI Visibility / LLM Observability** — separate integrations; see the
  discussion that led to this setup.

Costs: APM, log ingestion and indexing are billed per host / per GB. Leaving
`DD_TRACE_ENABLED=false` and not installing the Agent costs nothing.
