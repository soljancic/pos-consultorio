# Gate E2-M7: cancelar / no-asistio / reprogramar (API corriendo en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "e2m7$ts@test.com"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E2M7 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$token = $login.accessToken; if (-not $token) { $token = $login.access_token }
$h = @{ Authorization = "Bearer $token" }
$tiposCuenta = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h; $tcEfectivo = ($tiposCuenta | Where-Object { $_.esEfectivo }).id; $tcQr = ($tiposCuenta | Where-Object { $_.nombre -eq "QR" }).id
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null # E2-M9: turno abierto

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Gate" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Gabriel"; apellido = "Gate" } | ConvertTo-Json)

function Nueva-Cita($hora) {
  $fh = (Get-Date -Hour $hora -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
}

# 1) Reprogramar 10:00 -> 11:00: fechaHora nueva y estado PENDIENTE
$c1 = Nueva-Cita 10
$fh11 = (Get-Date -Hour 11 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$rep = Invoke-RestMethod -Uri "$base/citas/$($c1.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ fechaHora = $fh11 } | ConvertTo-Json)
$okHora = ([DateTime]$rep.fechaHora).ToUniversalTime().Hour -eq ([DateTime]$fh11).ToUniversalTime().Hour
Write-Output "1 REPROGRAMAR: estado=$($rep.estado) horaOk=$okHora (esperado PENDIENTE True)"

# 2) Reprogramar al horario ocupado -> 409
$c2 = Nueva-Cita 14
Esperar-Error { Invoke-RestMethod -Uri "$base/citas/$($c2.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ fechaHora = $fh11 } | ConvertTo-Json) } 409 "2 REPROGRAMAR SOLAPE"

# 3) Cancelar -> estado CANCELADA y cobro ANULADO
Invoke-RestMethod -Uri "$base/citas/$($c2.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "CANCELADA"; motivo = "gate e2m7" } | ConvertTo-Json) | Out-Null
$cobro2 = Invoke-RestMethod -Uri "$base/cobros/cita/$($c2.id)" -Headers $h
Write-Output "3 CANCELAR: cobro=$($cobro2.estado) (esperado ANULADO)"

# 4) Pagar un cobro anulado -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/cobros/$($cobro2.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 100; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) } 400 "4 PAGO SOBRE ANULADO"

# 5) Reabrir CANCELADA -> PENDIENTE revive el cobro
Invoke-RestMethod -Uri "$base/citas/$($c2.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "PENDIENTE" } | ConvertTo-Json) | Out-Null
$cobro2b = Invoke-RestMethod -Uri "$base/cobros/cita/$($c2.id)" -Headers $h
Write-Output "5 REABRIR: cobro=$($cobro2b.estado) (esperado PENDIENTE)"

# 6) Una cita con pagos no se puede cancelar (el pago la mueve a CON_DEUDA y
#    la maquina bloquea la transicion; el guard de pagos es defensa extra)
Invoke-RestMethod -Uri "$base/cobros/$($cobro2b.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 100; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
Esperar-Error { Invoke-RestMethod -Uri "$base/citas/$($c2.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "CANCELADA" } | ConvertTo-Json) } 400 "6 CANCELAR CON PAGOS"

# 7) PENDIENTE -> NO_ASISTIO directo (transicion nueva) y cobro ANULADO
$c3 = Nueva-Cita 16
Invoke-RestMethod -Uri "$base/citas/$($c3.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "NO_ASISTIO" } | ConvertTo-Json) | Out-Null
$cobro3 = Invoke-RestMethod -Uri "$base/cobros/cita/$($c3.id)" -Headers $h
Write-Output "7 NO_ASISTIO DIRECTO: cobro=$($cobro3.estado) (esperado ANULADO)"

# 8) Reprogramar una cita NO_ASISTIO -> 400 (estado no reprogramable)
Esperar-Error { Invoke-RestMethod -Uri "$base/citas/$($c3.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ fechaHora = $fh11 } | ConvertTo-Json) } 400 "8 REPROGRAMAR NO_ASISTIO"
