# ==============================================================================
# start-dev.ps1  -  OREAS Quick Cloudflare Tunnel Starter
# ==============================================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = $PSScriptRoot
$FrontendDir = Join-Path $ProjectRoot "frontend"
$EnvFile     = Join-Path $ProjectRoot ".env"

function Write-Step  { param($msg) Write-Host "`n   $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "   $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "   $msg" -ForegroundColor Yellow }

# 1. Start Quick Tunnel
Write-Step "Starting Cloudflare Quick Tunnel on port 5173..."
$tunnelLogFile = Join-Path $env:TEMP "cloudflared-tunnel.log"
if (Test-Path $tunnelLogFile) { Remove-Item $tunnelLogFile -Force }

$tunnelJob = Start-Job -ScriptBlock {
    param($logPath)
    & cloudflared tunnel --url http://localhost:5173 2>&1 | Tee-Object -FilePath $logPath
} -ArgumentList $tunnelLogFile

Write-Ok "Tunnel job started. Waiting for public URL..."

$tunnelUrl   = $null
$maxWaitSecs = 40
$waited      = 0

while ($waited -lt $maxWaitSecs) {
    Start-Sleep -Seconds 1
    $waited++
    if (Test-Path $tunnelLogFile) {
        $content = Get-Content $tunnelLogFile -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
            $tunnelUrl = $Matches[0]
            break
        }
    }
}

if ($tunnelUrl) {
    Write-Step "Updating .env with active URL: $tunnelUrl"
    $envContent = Get-Content $EnvFile -Raw
    if ($envContent -match 'SHOPIFY_APP_URL=.*') {
        $envContent = $envContent -replace 'SHOPIFY_APP_URL=.*', "SHOPIFY_APP_URL=$tunnelUrl"
    } else {
        $envContent += "`nSHOPIFY_APP_URL=$tunnelUrl`n"
    }
    Set-Content -Path $EnvFile -Value $envContent -NoNewline
    Write-Ok ".env updated."
}

# 2. Launch Django
Write-Step "Opening Django dev server window (port 8001)..."
$djangoCmd = "Set-Location '$ProjectRoot'; .\.venv\Scripts\python.exe manage.py runserver 8001; pause"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $djangoCmd
Write-Ok "Django window launched."

# 3. Launch Vite
Write-Step "Opening Vite dev server window (port 5173)..."
$viteCmd = "Set-Location '$FrontendDir'; npm run dev; pause"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $viteCmd
Write-Ok "Vite window launched."

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  OREAS DEV ENVIRONMENT ACTIVE"                                -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
if ($tunnelUrl) {
    Write-Host "  Tunnel URL (Paste in Shopify) : $tunnelUrl" -ForegroundColor Yellow
}
Write-Host "  Vite                           : http://localhost:5173" -ForegroundColor White
Write-Host "  Django                         : http://127.0.0.1:8001" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""

Wait-Job $tunnelJob | Out-Null
