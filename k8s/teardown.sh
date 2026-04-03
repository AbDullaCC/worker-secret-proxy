#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# teardown.sh — Delete the kind cluster and clean up
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

CLUSTER_NAME="secret-proxy-lab"

echo "Deleting kind cluster '${CLUSTER_NAME}'..."
kind delete cluster --name "${CLUSTER_NAME}"
echo "✓ Cluster deleted"
