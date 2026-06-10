$ErrorActionPreference = 'Continue'
$base = "http://localhost:3000/api/v1"

# 1. Health (publico, verifica DB)
$health = Invoke-RestMethod -Uri "$base/health"
Write-Output "HEALTH: $($health.status) (esp ok)"

# 2. Swagger visible en dev
try {
  $sw = Invoke-WebRequest -Uri "http://localhost:3000/api/docs" -UseBasicParsing
  Write-Output "SWAGGER DEV: $($sw.StatusCode) (esp 200 en dev)"
} catch { Write-Output "SWAGGER DEV: no responde (inesperado en dev)" }

# 3. Helmet: header de seguridad presente
$resp = Invoke-WebRequest -Uri "$base/health" -UseBasicParsing
$tieneHelmet = $null -ne $resp.Headers['X-Content-Type-Options']
Write-Output "HELMET HEADERS: $tieneHelmet (esp True)"

# 4. Throttle en login: 10 permitidos por minuto, el 11vo da 429
$status429 = $false
for ($i = 1; $i -le 11; $i++) {
  try {
    Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"x@x.com","password":"wrongpass1"}' -ErrorAction Stop | Out-Null
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 429) { $status429 = $true; Write-Output "THROTTLE LOGIN: 429 en intento $i (esp <= 11)"; break }
  }
}
if (-not $status429) {
  Write-Output "THROTTLE LOGIN: sin 429 en 11 intentos — esperado si LOGIN_RATE_LIMIT esta alto (dev/E2E)."
  Write-Output "                En produccion (defaults: 10/min) este check DEBE dar 429."
}

# 5. REGISTRO_ABIERTO por defecto (true): register responde (400 por body vacio, no 403)
try {
  Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body '{}' -ErrorAction Stop | Out-Null
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Output "REGISTER ABIERTO: status=$code (esp 400 validacion, NO 403)"
}
