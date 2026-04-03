# setup.ps1 - Create kind cluster and deploy all lab components
$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClusterName = "secret-proxy-lab"
$Namespace = "proxy-system"
$CalicoVersion = "v3.29.3"
$NodeImage = "kindest/node:v1.31.0"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Secret Proxy Lab - Kubernetes Setup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# -- 1. Create kind cluster --
Write-Host ""
Write-Host "[Step 1] Creating kind cluster '$ClusterName'..." -ForegroundColor Yellow
$existing = (kind get clusters 2>&1) | Where-Object { $_ -eq $ClusterName }
if ($existing) {
    Write-Host "  Cluster already exists. Delete it first with: kind delete cluster --name $ClusterName" -ForegroundColor Red
    exit 1
}

kind create cluster --name $ClusterName --config "$ScriptDir\kind-config.yaml" --image $NodeImage
if ($LASTEXITCODE -ne 0) { Write-Host "  FAILED to create cluster" -ForegroundColor Red; exit 1 }
Write-Host "  [OK] Cluster created" -ForegroundColor Green

# -- 2. Install Calico CNI (required for NetworkPolicy) --
Write-Host ""
Write-Host "[Step 2] Installing Calico CNI $CalicoVersion..." -ForegroundColor Yellow
kubectl apply -f "https://raw.githubusercontent.com/projectcalico/calico/$CalicoVersion/manifests/calico.yaml"
if ($LASTEXITCODE -ne 0) { Write-Host "  FAILED to apply Calico" -ForegroundColor Red; exit 1 }

Write-Host "  Waiting for Calico pods to be ready (this may take 1-2 minutes)..."
kubectl wait --for=condition=Ready pods -l k8s-app=calico-node -n kube-system --timeout=3000s
if ($LASTEXITCODE -ne 0) { Write-Host "  FAILED - Calico pods did not become ready" -ForegroundColor Red; exit 1 }
Write-Host "  [OK] Calico installed and ready" -ForegroundColor Green

# -- 3. Create namespace --
Write-Host ""
Write-Host "[Step 3] Creating namespace '$Namespace'..." -ForegroundColor Yellow
kubectl apply -f "$ScriptDir\namespace.yaml"
Write-Host "  [OK] Namespace created" -ForegroundColor Green

# -- 4. Deploy mock-provider --
Write-Host ""
Write-Host "[Step 4] Deploying mock-provider..." -ForegroundColor Yellow
kubectl apply -f "$ScriptDir\mock-provider\configmap.yaml"
kubectl apply -f "$ScriptDir\mock-provider\deployment.yaml"
kubectl apply -f "$ScriptDir\mock-provider\service.yaml"
Write-Host "  Waiting for mock-provider rollout..."
kubectl rollout status deployment/mock-provider -n $Namespace --timeout=60s
if ($LASTEXITCODE -ne 0) { Write-Host "  FAILED - mock-provider rollout" -ForegroundColor Red; exit 1 }
Write-Host "  [OK] mock-provider deployed" -ForegroundColor Green

# -- 5. Deploy secretproxy --
Write-Host ""
Write-Host "[Step 5] Deploying secretproxy..." -ForegroundColor Yellow
kubectl apply -f "$ScriptDir\proxy\configmap.yaml"
kubectl apply -f "$ScriptDir\proxy\deployment.yaml"
kubectl apply -f "$ScriptDir\proxy\service.yaml"
Write-Host "  Waiting for secretproxy rollout..."
kubectl rollout status deployment/secretproxy -n $Namespace --timeout=60s
if ($LASTEXITCODE -ne 0) { Write-Host "  FAILED - secretproxy rollout" -ForegroundColor Red; exit 1 }
Write-Host "  [OK] secretproxy deployed" -ForegroundColor Green

# -- 6. Deploy sample-app --
Write-Host ""
Write-Host "[Step 6] Deploying sample-app pod..." -ForegroundColor Yellow
kubectl apply -f "$ScriptDir\sample-app\pod.yaml"
Write-Host "  Waiting for sample-app to be ready..."
kubectl wait --for=condition=Ready pod/sample-app -n $Namespace --timeout=60s
if ($LASTEXITCODE -ne 0) { Write-Host "  FAILED - sample-app did not become ready" -ForegroundColor Red; exit 1 }
Write-Host "  [OK] sample-app ready" -ForegroundColor Green

# -- 7. Apply NetworkPolicy --
Write-Host ""
Write-Host "[Step 7] Applying NetworkPolicies..." -ForegroundColor Yellow
kubectl apply -f "$ScriptDir\network-policy.yaml"
Write-Host "  [OK] NetworkPolicies applied" -ForegroundColor Green

# -- 8. Verification --
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Verification" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "[Pods]" -ForegroundColor Yellow
kubectl get pods -n $Namespace -o wide

Write-Host ""
Write-Host "[Services]" -ForegroundColor Yellow
kubectl get svc -n $Namespace

Write-Host ""
Write-Host "[NetworkPolicies]" -ForegroundColor Yellow
kubectl get networkpolicies -n $Namespace

Write-Host ""
Write-Host "[Test 1] Health check (sample-app -> secretproxy via DNS)" -ForegroundColor Yellow
kubectl exec -n $Namespace sample-app -- curl -s http://secretproxy.proxy-system.svc.cluster.local/healthz

Write-Host ""
Write-Host "[Test 2] Full path (sample-app -> proxy -> mock-provider)" -ForegroundColor Yellow
kubectl exec -n $Namespace sample-app -- curl -s -X POST http://secretproxy.proxy-system.svc.cluster.local/stripe/charges

Write-Host ""
Write-Host "[Test 3] NetworkPolicy block (sample-app -> mock-provider direct, should timeout)" -ForegroundColor Yellow
Write-Host "  (waiting up to 3 seconds...)"
$netpolResult = kubectl exec -n $Namespace sample-app -- curl -s --connect-timeout 3 http://mock-provider.proxy-system.svc.cluster.local/healthz 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "  [OK] Direct access blocked by NetworkPolicy (as expected)" -ForegroundColor Green } else { Write-Host "  [WARN] Direct access was NOT blocked (NetworkPolicy may not be enforced yet)" -ForegroundColor DarkYellow }

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Lab setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Try these commands manually:"
Write-Host "    kubectl exec -n $Namespace sample-app -- curl -s http://secretproxy.proxy-system.svc.cluster.local/"
Write-Host "    kubectl exec -n $Namespace sample-app -- curl -s -X POST http://secretproxy.proxy-system.svc.cluster.local/stripe/charges"
Write-Host "    kubectl logs -n $Namespace -l app=secretproxy"
Write-Host "==========================================================" -ForegroundColor Cyan
