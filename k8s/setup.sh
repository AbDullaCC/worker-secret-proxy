#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# setup.sh — Create kind cluster and deploy all lab components
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLUSTER_NAME="secret-proxy-lab"
NAMESPACE="proxy-system"
CALICO_VERSION="v3.29.3"
NODE_IMAGE="kindest/node:v1.31.14@sha256:6f86cf509dbb42767b6e79debc3f2c32e4ee01386f0489b3b2be24b0a55aac2b"

echo "══════════════════════════════════════════════════════════"
echo "  Secret Proxy Lab — Kubernetes Setup"
echo "══════════════════════════════════════════════════════════"

# ── 1. Create kind cluster ────────────────────────────────────────
echo ""
echo "▸ Step 1: Creating kind cluster '${CLUSTER_NAME}'..."
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "  Cluster already exists. Delete it first with: kind delete cluster --name ${CLUSTER_NAME}"
  exit 1
fi

kind create cluster --name "${CLUSTER_NAME}" --config "${SCRIPT_DIR}/kind-config.yaml" --image "${NODE_IMAGE}"
echo "  ✓ Cluster created"

# ── 2. Install Calico CNI (required for NetworkPolicy) ────────────
echo ""
echo "▸ Step 2: Installing Calico CNI ${CALICO_VERSION}..."
kubectl apply -f "https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/calico.yaml"
echo "  Waiting for Calico pods to be ready (this may take 1-2 minutes)..."
kubectl wait --for=condition=Ready pods -l k8s-app=calico-node -n kube-system --timeout=120s
echo "  ✓ Calico installed and ready"

# ── 3. Create namespace ──────────────────────────────────────────
echo ""
echo "▸ Step 3: Creating namespace '${NAMESPACE}'..."
kubectl apply -f "${SCRIPT_DIR}/namespace.yaml"
echo "  ✓ Namespace created"

# ── 4. Deploy mock-provider ──────────────────────────────────────
echo ""
echo "▸ Step 4: Deploying mock-provider..."
kubectl apply -f "${SCRIPT_DIR}/mock-provider/configmap.yaml"
kubectl apply -f "${SCRIPT_DIR}/mock-provider/deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/mock-provider/service.yaml"
echo "  Waiting for mock-provider rollout..."
kubectl rollout status deployment/mock-provider -n "${NAMESPACE}" --timeout=60s
echo "  ✓ mock-provider deployed"

# ── 5. Deploy secretproxy ────────────────────────────────────────
echo ""
echo "▸ Step 5: Deploying secretproxy..."
kubectl apply -f "${SCRIPT_DIR}/proxy/configmap.yaml"
kubectl apply -f "${SCRIPT_DIR}/proxy/deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/proxy/service.yaml"
echo "  Waiting for secretproxy rollout..."
kubectl rollout status deployment/secretproxy -n "${NAMESPACE}" --timeout=60s
echo "  ✓ secretproxy deployed"

# ── 6. Deploy sample-app ─────────────────────────────────────────
echo ""
echo "▸ Step 6: Deploying sample-app pod..."
kubectl apply -f "${SCRIPT_DIR}/sample-app/pod.yaml"
echo "  Waiting for sample-app to be ready..."
kubectl wait --for=condition=Ready pod/sample-app -n "${NAMESPACE}" --timeout=60s
echo "  ✓ sample-app ready"

# ── 7. Apply NetworkPolicy ───────────────────────────────────────
echo ""
echo "▸ Step 7: Applying NetworkPolicies..."
kubectl apply -f "${SCRIPT_DIR}/network-policy.yaml"
echo "  ✓ NetworkPolicies applied"

# ── 8. Verification ──────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Verification"
echo "══════════════════════════════════════════════════════════"

echo ""
echo "▸ All pods:"
kubectl get pods -n "${NAMESPACE}" -o wide

echo ""
echo "▸ All services:"
kubectl get svc -n "${NAMESPACE}"

echo ""
echo "▸ NetworkPolicies:"
kubectl get networkpolicies -n "${NAMESPACE}"

echo ""
echo "▸ Test 1: Health check (sample-app → secretproxy via DNS)"
kubectl exec -n "${NAMESPACE}" sample-app -- \
  curl -s http://secretproxy.proxy-system.svc.cluster.local/healthz
echo ""

echo ""
echo "▸ Test 2: Full path (sample-app → proxy → mock-provider)"
kubectl exec -n "${NAMESPACE}" sample-app -- \
  curl -s http://secretproxy.proxy-system.svc.cluster.local/stripe/charges -X POST
echo ""

echo ""
echo "▸ Test 3: NetworkPolicy block (sample-app → mock-provider direct, should timeout)"
echo "  (waiting up to 3 seconds...)"
if kubectl exec -n "${NAMESPACE}" sample-app -- \
  curl -s --connect-timeout 3 http://mock-provider.proxy-system.svc.cluster.local/healthz 2>/dev/null; then
  echo "  ⚠ WARNING: Direct access was NOT blocked (NetworkPolicy may not be enforced yet)"
else
  echo "  ✓ Direct access blocked by NetworkPolicy (as expected)"
fi

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  ✅ Lab setup complete!"
echo ""
echo "  Try these commands manually:"
echo "    kubectl exec -n ${NAMESPACE} sample-app -- curl -s http://secretproxy.proxy-system.svc.cluster.local/"
echo "    kubectl exec -n ${NAMESPACE} sample-app -- curl -s -X POST http://secretproxy.proxy-system.svc.cluster.local/stripe/charges"
echo "    kubectl logs -n ${NAMESPACE} -l app=secretproxy"
echo "══════════════════════════════════════════════════════════"
