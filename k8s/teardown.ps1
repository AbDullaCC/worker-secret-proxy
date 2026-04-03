# ═══════════════════════════════════════════════════════════════════
# teardown.ps1 — Delete the kind cluster and clean up
# ═══════════════════════════════════════════════════════════════════
$ClusterName = "secret-proxy-lab"

Write-Host "Deleting kind cluster '$ClusterName'..."
kind delete cluster --name $ClusterName
Write-Host "✓ Cluster deleted" -ForegroundColor Green
