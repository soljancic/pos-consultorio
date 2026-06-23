<#
.SYNOPSIS
  Deploy manual a Railway (proyecto Consultech).

.DESCRIPTION
  El proyecto NO tiene auto-deploy de GitHub: el deploy se dispara a mano.
  Este script sube el monorepo a los servicios 'api' y 'web' del entorno
  production. Las variables de entorno y la config de build (RAILPACK) viven
  en el dashboard de cada servicio; aca solo se sube el codigo.

  El archivo .gitignore se respeta (node_modules y demas quedan fuera del tar).

.PREREQUISITOS
  - Railway CLI instalado y logueado:  railway login
  - Permisos sobre el proyecto Consultech.

.EJEMPLOS
  pnpm deploy                 # via package.json (ver "deploy" script)
  ./scripts/deploy.ps1        # directo
  ./scripts/deploy.ps1 -Service api   # deployar solo un servicio
#>
param(
  # Si se pasa, deploya solo ese servicio. Por defecto: api y luego web.
  [ValidateSet('api', 'web')]
  [string]$Service
)

$ErrorActionPreference = 'Stop'

# IDs/nombres del proyecto Consultech (no son secretos; la auth es tu railway login)
$ProjectId  = '02c99275-ceef-4b0b-90da-4ab5a9e758cf'
$Environment = 'production'
$Root = Split-Path -Parent $PSScriptRoot

$services = if ($Service) { @($Service) } else { @('api', 'web') }

Write-Host "Deploy a Railway / Consultech ($Environment)" -ForegroundColor Cyan
Write-Host "Servicios: $($services -join ', ')"

Push-Location $Root
try {
  foreach ($svc in $services) {
    Write-Host ""
    Write-Host "==> Deployando '$svc'..." -ForegroundColor Cyan
    railway up --ci --project $ProjectId --environment $Environment --service $svc --message "deploy $svc"
    if ($LASTEXITCODE -ne 0) { throw "Fallo el deploy de '$svc' (exit $LASTEXITCODE)" }
    Write-Host "==> '$svc' OK" -ForegroundColor Green
  }
  Write-Host ""
  Write-Host "Deploy completo." -ForegroundColor Green
  Write-Host "  web: https://consultech.up.railway.app"
  Write-Host "  api: https://api.up.railway.app/api/v1/health"
}
finally {
  Pop-Location
}
