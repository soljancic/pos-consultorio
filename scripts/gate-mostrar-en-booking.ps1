# Gate: mostrarEnBooking + servicios ocultos resolubles por ID (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "meb$ts@test.com"
$slug = "meb$ts"

function Esperar-Error($accion, $codigoEsperado, $etiqueta) {
  try {
    & $accion | Out-Null
    Write-Output "$etiqueta : FALLO (no dio error, esperado $codigoEsperado)"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq $codigoEsperado) { Write-Output "$etiqueta : OK ($status)" }
    else { Write-Output "$etiqueta : FALLO (dio $status, esperado $codigoEsperado)" }
  }
}

# Harness: registrar, login, obtener token
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "MEB $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# 1) Crear servicio A con mostrarEnBooking=true y servicio B con mostrarEnBooking=false
$svcA = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 100; mostrarEnBooking = $true } | ConvertTo-Json)
$svcB = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Reconsulta"; duracionMin = 20; precioBase = 80; mostrarEnBooking = $false } | ConvertTo-Json)
Write-Output "1 CREAR SERVICIOS: A=$($svcA.id) mostrarEnBooking=$($svcA.mostrarEnBooking) (esp true) B=$($svcB.id) mostrarEnBooking=$($svcB.mostrarEnBooking) (esp false)"

# 2) Activar portal y setear slug
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ slug = $slug; portalActivo = $true } | ConvertTo-Json) | Out-Null
Write-Output "2 PORTAL ACTIVADO: slug=$slug"

# 3) GET /public/:slug -> servicios incluye A, NO incluye B
$info = Invoke-RestMethod -Uri "$base/public/$slug" -Method Get
$idsPublicos = @($info.servicios | ForEach-Object { $_.id })
Write-Output "3 INFO PUBLICA: servicios visibles=$(@($idsPublicos).Count)"

if ($idsPublicos -contains $svcB.id) {
  throw "FAIL: servicio oculto (B) aparece en GET /public/$slug"
}
Write-Output "   ✓ B ausente (correcto)"

if (-not ($idsPublicos -contains $svcA.id)) {
  throw "FAIL: servicio visible (A) NO aparece en GET /public/$slug"
}
Write-Output "   ✓ A presente (correcto)"

# 4) GET /public/:slug/servicio/:idB -> 200 con nombre de B (oculto, resuelto por id)
$resuelto = Invoke-RestMethod -Uri "$base/public/$slug/servicio/$($svcB.id)" -Method Get
if ($resuelto.nombre -ne "Reconsulta") {
  throw "FAIL: GET /public/$slug/servicio/$($svcB.id) no resolvio nombre esperado"
}
Write-Output "4 RESOLVER SERVICIO OCULTO: id=$($svcB.id) nombre=$($resuelto.nombre) mostrarEnBooking=$($resuelto.mostrarEnBooking) (esp Reconsulta, false)"

# 5) GET /public/:slug/servicio/:idInexistente -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug/servicio/999999" -Method Get } 404 "5 SERVICIO INEXISTENTE"

Write-Host "GATE mostrar-en-booking: PASS" -ForegroundColor Green
