# Secret Proxy Lab — Kubernetes Setup Guide

A reproducible guide to deploy three workloads in a kind cluster with Kubernetes DNS,
health probes, and NetworkPolicy enforcement.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Docker** | 20+ | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| **kind** | 0.20+ | `go install sigs.k8s.io/kind@latest` or [kind.sigs.k8s.io](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) |
| **kubectl** | 1.28+ | [kubernetes.io/docs/tasks/tools](https://kubernetes.io/docs/tasks/tools/) |

> Docker Desktop must be **running** before you proceed.

---

## Quick Start (One Command)

```bash
cd k8s
bash setup.sh
```

This creates the cluster, installs Calico, deploys everything, and runs verification.

To tear down:
```bash
bash teardown.sh
```

---

## Manual Step-by-Step

### Step 1 — Create the kind cluster

```bash
kind create cluster --name secret-proxy-lab --config kind-config.yaml
```

The config:
- **Pins Kubernetes to v1.31.14** (v1.35 has known issues with kind on some setups)
- **Disables the default CNI** (kindnet) so we can install Calico, which supports NetworkPolicy
- Uses SHA256 digest for the node image to guarantee reproducibility

### Step 2 — Install Calico CNI

```bash
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.3/manifests/calico.yaml

# Wait for Calico to be ready
kubectl wait --for=condition=Ready pods -l k8s-app=calico-node -n kube-system --timeout=120s
```

### Step 3 — Create the namespace

```bash
kubectl apply -f namespace.yaml
```

### Step 4 — Deploy mock-provider

```bash
kubectl apply -f mock-provider/configmap.yaml
kubectl apply -f mock-provider/deployment.yaml
kubectl apply -f mock-provider/service.yaml
kubectl rollout status deployment/mock-provider -n proxy-system --timeout=60s
```

### Step 5 — Deploy secretproxy

```bash
kubectl apply -f proxy/configmap.yaml
kubectl apply -f proxy/deployment.yaml
kubectl apply -f proxy/service.yaml
kubectl rollout status deployment/secretproxy -n proxy-system --timeout=60s
```

### Step 6 — Deploy sample-app

```bash
kubectl apply -f sample-app/pod.yaml
kubectl wait --for=condition=Ready pod/sample-app -n proxy-system --timeout=60s
```

### Step 7 — Verify the full path

```bash
# Health check
kubectl exec -n proxy-system sample-app -- \
  curl -s http://secretproxy.proxy-system.svc.cluster.local/healthz

# Full path: sample-app → proxy → mock-provider
kubectl exec -n proxy-system sample-app -- \
  curl -s -X POST http://secretproxy.proxy-system.svc.cluster.local/stripe/charges
```

### Step 8 — Apply NetworkPolicy

```bash
kubectl apply -f network-policy.yaml

# Verify policies are created
kubectl get networkpolicies -n proxy-system
```

### Step 9 — Test NetworkPolicy enforcement

```bash
# ✅ This should still work (sample-app → proxy is allowed)
kubectl exec -n proxy-system sample-app -- \
  curl -s http://secretproxy.proxy-system.svc.cluster.local/healthz

# ❌ This should TIMEOUT (sample-app → mock-provider is blocked)
kubectl exec -n proxy-system sample-app -- \
  curl -s --connect-timeout 3 http://mock-provider.proxy-system.svc.cluster.local/healthz
```

---

## Exact Curl Commands Used

### 1. Health check on proxy via DNS
```bash
kubectl exec -n proxy-system sample-app -- \
  curl -s http://secretproxy.proxy-system.svc.cluster.local/healthz
```
Expected:
```json
{"status":"healthy","service":"secretproxy"}
```

### 2. Full path: app → proxy → mock-provider (Stripe charges)
```bash
kubectl exec -n proxy-system sample-app -- \
  curl -s -X POST http://secretproxy.proxy-system.svc.cluster.local/stripe/charges
```
Expected:
```json
{"id":"ch_mock_1234567890","object":"charge","amount":1000,"currency":"usd","status":"succeeded","description":"Mock charge from mock-provider pod","source":"mock-provider.proxy-system.svc.cluster.local"}
```

### 3. Catch-all proxy route
```bash
kubectl exec -n proxy-system sample-app -- \
  curl -s http://secretproxy.proxy-system.svc.cluster.local/any/path
```
Expected:
```json
{"status":"ok","source":"mock-provider","message":"Request reached the mock external provider"}
```

### 4. Verify NetworkPolicy blocks direct mock-provider access
```bash
kubectl exec -n proxy-system sample-app -- \
  curl -s --connect-timeout 3 http://mock-provider.proxy-system.svc.cluster.local/healthz
```
Expected: **timeout** (connection refused or timeout after 3s)

---

## Architecture

```
Namespace: proxy-system

  sample-app (curlimages/curl)
       │
       │  curl http://secretproxy.proxy-system.svc.cluster.local/...
       │  (allowed by NetworkPolicy: allow-app-to-proxy)
       ▼
  secretproxy (nginx:alpine, reverse proxy)
       │  Service: secretproxy  ClusterIP:80
       │
       │  proxy_pass http://mock-provider.proxy-system.svc.cluster.local/...
       │  (allowed by NetworkPolicy: allow-proxy-to-mock)
       ▼
  mock-provider (nginx:alpine, static JSON)
       Service: mock-provider  ClusterIP:80


  NetworkPolicy Summary:
  ┌──────────────────────────────────────────────────┐
  │  default-deny-ingress   → blocks ALL ingress     │
  │  allow-app-to-proxy     → sample-app → proxy     │
  │  allow-proxy-to-mock    → proxy → mock-provider  │
  │                                                  │
  │  ✅ sample-app → proxy        ALLOWED            │
  │  ✅ proxy → mock-provider     ALLOWED            │
  │  ❌ sample-app → mock-provider BLOCKED           │
  └──────────────────────────────────────────────────┘
```

## Teardown

```bash
kind delete cluster --name secret-proxy-lab
```
