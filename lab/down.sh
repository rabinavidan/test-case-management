#!/usr/bin/env bash
# Delete the whole lab cluster (every environment and its data).
set -euo pipefail
kind delete cluster --name testflow-lab
