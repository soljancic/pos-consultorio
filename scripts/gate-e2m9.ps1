# Gate E2-M9: apertura de turno con caja chica + bloqueo sin caja abierta (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "e2m9$ts@test.com"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E2M9 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$hoy = Get-Date -Format "yyyy-MM-dd"

# Catalogo + cita atendida (las citas no requieren caja; el dinero si)
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 2000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. T" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Turno"; apellido = "Test" } | ConvertTo-Json)
$fh = (Get-Date -Hour 9 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
foreach ($e in @('CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA')) {
  Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$cobro = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h

# 1) Sin caja abierta: cobrar -> 409; gastar -> 409
Esperar-Error { Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 500; formaPago = "EFECTIVO" } | ConvertTo-Json) } 409 "1 COBRAR SIN CAJA"
Esperar-Error { Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; categoria = "OTROS"; monto = 100; descripcion = "x"; cuenta = "CAJA_EFECTIVO" } | ConvertTo-Json) } 409 "2 GASTAR SIN CAJA"

# 3) Abrir con caja chica 100; re-abrir -> 400
$ap = Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 100; notasApertura = "gate" } | ConvertTo-Json)
Write-Output "3 ABRIR: inicial=$($ap.montoInicial) (esp 100) abierta=$($null -ne $ap.abiertaAt) (esp True)"
Esperar-Error { Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) } 400 "4 RE-ABRIR"

# 5) Con caja abierta: cobrar 2000 efectivo + gasto 500 efectivo
Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 2000; formaPago = "EFECTIVO" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; categoria = "INSUMOS"; monto = 500; descripcion = "gasas"; cuenta = "CAJA_EFECTIVO" } | ConvertTo-Json) | Out-Null

# 6) Arqueo con inicial: esperado = 100 + 2000 - 500 = 1600 -> diferencia 0
$cierre = Invoke-RestMethod -Uri "$base/caja/cerrar" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoDeclarado = 1600 } | ConvertTo-Json)
Write-Output "6 ARQUEO CON INICIAL: esperado=$($cierre.montoEsperado) (esp 1600) diferencia=$($cierre.diferencia) (esp 0) auto=$($null -ne $cierre.revisadaAt) (esp True)"

# 7) Tras el cierre: cobrar/gastar -> 409 (turno terminado)
Esperar-Error { Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; categoria = "OTROS"; monto = 50; descripcion = "y"; cuenta = "BANCO" } | ConvertTo-Json) } 409 "7 GASTAR TRAS CIERRE"
