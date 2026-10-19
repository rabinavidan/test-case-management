#!/usr/bin/env bash
# Bring up the local TestFlow lab: a 4-worker kind cluster (one node per
# environment) and the full stack — 6 services + Postgres, Redis, Kafka,
# MongoDB — in each requested environment. See lab/README.md.
#
#   lab/up.sh                      # all four: staging regression preprod prod
#   lab/up.sh staging regression   # only these (lighter on a laptop)
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER=testflow-lab
ENVS=("$@")
[ ${#ENVS[@]} -eq 0 ] && ENVS=(staging regression preprod prod)
SERVICES=(auth projects runs ai worker gateway)

if ! kind get clusters | grep -qx "$CLUSTER"; then
  kind create cluster --config lab/kind-config.yaml
fi

for s in "${SERVICES[@]}"; do
  dockerfile=services/$s/Dockerfile
  [ "$s" = gateway ] && dockerfile=services/gateway/Dockerfile_gateway
  docker build -q -t "testflow/$s:lab" -f "$dockerfile" . >/dev/null
  kind load docker-image "testflow/$s:lab" --name "$CLUSTER" >/dev/null
  echo "image testflow/$s:lab loaded"
done

for e in "${ENVS[@]}"; do
  kubectl apply -k "k8s/overlays/lab/$e" >/dev/null
  echo "applied $e"
done

for e in "${ENVS[@]}"; do
  for d in "${SERVICES[@]}" kafka redis; do
    kubectl rollout status "deploy/$d" -n "testflow-$e" --timeout=300s >/dev/null
  done
  kubectl rollout status statefulset/db statefulset/mongo -n "testflow-$e" --timeout=300s >/dev/null
  echo "$e ready"
done

echo
echo "Done. Open an environment with:"
echo "  kubectl port-forward svc/gateway 8000:8000 -n testflow-${ENVS[0]}"
