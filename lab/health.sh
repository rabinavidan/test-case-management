#!/usr/bin/env bash
# Fail (exit 1) unless every TestFlow workload in one lab environment is Ready.
# Readiness here is the pods' own readinessProbe — /health/ready, which checks
# the database (services/common/health.py) — so this is the same signal the
# Service uses to route traffic, not a separate check that could disagree.
#
#   lab/health.sh staging
set -uo pipefail
ns="testflow-${1:?usage: lab/health.sh <staging|regression|preprod|prod>}"
fail=0
for app in gateway auth projects runs ai worker db redis kafka mongo; do
  if kubectl wait pod -l "app=$app" -n "$ns" --for=condition=Ready --timeout=60s >/dev/null 2>&1; then
    echo "OK   $app"
  else
    echo "FAIL $app"; fail=1
  fi
done
exit $fail
