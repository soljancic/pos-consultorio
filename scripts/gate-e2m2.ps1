# Gate E2-M2: arqueo de caja ciego (API en :3000). Dos tenants: cierre exacto y con faltante.
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"

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

function Nuevo-Tenant($sufijo) {
  $ts = (Get-Date -Format "HHmmss") + $sufijo
  $email = "e2m2$ts@test.com"
  Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E2M2 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
  $login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
  $h = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null # E2-M9: turno abierto
  $srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 2000 } | ConvertTo-Json)
  $doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. A" } | ConvertTo-Json)
  $pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Caja"; apellido = "Test" } | ConvertTo-Json)
  $fh = (Get-Date -Hour 9 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  $cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
  foreach ($e in @('CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA')) {
    Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
  }
  $cobro = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h
  Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 2000; formaPago = "EFECTIVO" } | ConvertTo-Json) | Out-Null
  return $h
}

# 1) Cierre exacto: diferencia 0 y auto-aprobada
$hA = Nuevo-Tenant "a"
$cierreA = Invoke-RestMethod -Uri "$base/caja/cerrar" -Method Post -Headers $hA -ContentType "application/json" -Body (@{ montoDeclarado = 2000 } | ConvertTo-Json)
Write-Output "1 CIERRE EXACTO: diferencia=$($cierreA.diferencia) (esp 0) autoRevisada=$($null -ne $cierreA.revisadaAt) (esp True)"

# 2) Re-cerrar -> 400; cerrar sin monto -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/caja/cerrar" -Method Post -Headers $hA -ContentType "application/json" -Body (@{ montoDeclarado = 2000 } | ConvertTo-Json) } 400 "2 RE-CERRAR"
$hB = Nuevo-Tenant "b"
Esperar-Error { Invoke-RestMethod -Uri "$base/caja/cerrar" -Method Post -Headers $hB -ContentType "application/json" -Body '{}' } 400 "3 CERRAR SIN MONTO"

# 4) Cierre con faltante: diferencia negativa, pendiente de revision
$cierreB = Invoke-RestMethod -Uri "$base/caja/cerrar" -Method Post -Headers $hB -ContentType "application/json" -Body (@{ montoDeclarado = 1500; notasCierre = "falto plata" } | ConvertTo-Json)
Write-Output "4 CIERRE CON FALTANTE: diferencia=$($cierreB.diferencia) (esp -500) pendiente=$($null -eq $cierreB.revisadaAt) (esp True)"

# 5) SECRETARIA no puede revisar -> 403
$ts2 = Get-Date -Format "HHmmss"
$secEmail = "sec$ts2@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $hB -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
Esperar-Error { Invoke-RestMethod -Uri "$base/caja/$($cierreB.id)/revisar" -Method Put -Headers $hSec -ContentType "application/json" -Body '{}' } 403 "5 SECRETARIA REVISA"

# 6) ADMIN revisa con nota -> aprobada; re-revisar -> 400
$rev = Invoke-RestMethod -Uri "$base/caja/$($cierreB.id)/revisar" -Method Put -Headers $hB -ContentType "application/json" -Body (@{ nota = "faltante asumido" } | ConvertTo-Json)
Write-Output "6 ADMIN REVISA: revisada=$($null -ne $rev.revisadaAt) (esp True) nota=$($rev.notasRevision)"
Esperar-Error { Invoke-RestMethod -Uri "$base/caja/$($cierreB.id)/revisar" -Method Put -Headers $hB -ContentType "application/json" -Body '{}' } 400 "7 RE-REVISAR"

# 8) Historial expone el arqueo
$hoy = Get-Date -Format "yyyy-MM-dd"
$hist = Invoke-RestMethod -Uri "$base/caja/historial?desde=$hoy&hasta=$hoy" -Headers $hB
Write-Output "8 HISTORIAL: declarado=$($hist[0].montoDeclarado) (esp 1500) esperado=$($hist[0].montoEsperado) (esp 2000)"
