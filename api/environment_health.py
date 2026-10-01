"""Synthetic environment health, shared by GET /api/environments and the
triage agent's get_run_environment_status tool (api/triage_agent.py).

This demo has no live cluster behind it (it runs on Vercel), so pod/node
health is synthetic telemetry standing in for a kubectl/metrics-server poll:
deterministic within a 5-minute window so numbers don't jitter on every
refresh, and closer to "healthy" for prod/preprod than for staging/regression,
mirroring the stability gradient a real pipeline has. Swap
simulate_environment_health() for a real Kubernetes client call
(`kubernetes.client.CoreV1Api`) to point this at an actual cluster; the
node/namespace layout it reports already matches k8s/overlays/<key>/.
"""
import hashlib
import random
import time

ENVIRONMENT_DESIRED_PODS = {"staging": 2, "regression": 2, "preprod": 3, "prod": 4}


def simulate_environment_health(key: str) -> dict:
    bucket = int(time.time() // 300)
    seed = int(hashlib.sha256(f"{key}:{bucket}".encode()).hexdigest(), 16)
    rnd = random.Random(seed)
    desired = ENVIRONMENT_DESIRED_PODS.get(key, 2)
    healthy_bias = 0.97 if key in ("prod", "preprod") else 0.9
    ready = desired if rnd.random() < healthy_bias else max(0, desired - rnd.randint(1, 2))
    health_status = "healthy" if ready == desired else ("degraded" if ready > 0 else "down")
    load_bias = 15 if key == "prod" else 0
    return {
        "status": health_status,
        "pods_ready": ready,
        "pods_desired": desired,
        "cpu_pct": round(rnd.uniform(15, 45) + load_bias, 1),
        "mem_pct": round(rnd.uniform(20, 55) + load_bias, 1),
        "uptime_seconds": rnd.randint(3600, 30 * 24 * 3600),
    }
