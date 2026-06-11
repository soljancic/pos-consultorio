# Gate E2-M1: anulacion de pagos con asiento de reversa (API en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "e2m1$ts@test.com"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E2M1 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null # E2-M9: turno abierto

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 5000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. R" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Rita"; apellido = "Reversa" } | ConvertTo-Json)
$fh = (Get-Date -Hour 9 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
foreach ($e in @('CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA')) {
  Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$cobro = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h
Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 2000; formaPago = "EFECTIVO" } | ConvertTo-Json) | Out-Null
$pagoId = (Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h).pagos[0].id

# 1) Anular el pago parcial: saldo y deuda restaurados, caja en 0, reversa creada
$res = Invoke-RestMethod -Uri "$base/cobros/pagos/$pagoId/anular" -Method Post -Headers $h -ContentType "application/json" -Body (@{ motivo = "gate e2m1" } | ConvertTo-Json)
$pacTras = Invoke-RestMethod -Uri "$base/pacientes/$($pac.id)" -Headers $h
$cajaTras = Invoke-RestMethod -Uri "$base/caja/hoy" -Headers $h
$original = $res.pagos | Where-Object { $_.id -eq $pagoId }
$reversa = $res.pagos | Where-Object { [decimal]$_.monto -lt 0 }
Write-Output "1 ANULAR PARCIAL: saldo=$($res.saldoPendiente) (esp 5000) estado=$($res.estado) (esp PENDIENTE) deudaTotal=$($pacTras.deudaTotal) (esp 5000)"
Write-Output "   original anulado=$($null -ne $original.anuladoAt) (esp True) reversa=$($reversa.monto) (esp -2000) cajaEfectivo=$($cajaTras.caja.totalEfectivo) (esp 0)"

# 2) Re-anular el mismo pago -> 400; anular la reversa -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/cobros/pagos/$pagoId/anular" -Method Post -Headers $h -ContentType "application/json" -Body '{}' } 400 "2 RE-ANULAR"
Esperar-Error { Invoke-RestMethod -Uri "$base/cobros/pagos/$($reversa.id)/anular" -Method Post -Headers $h -ContentType "application/json" -Body '{}' } 400 "3 ANULAR REVERSA"

# 4) SECRETARIA no puede anular -> 403
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ monto = 1000; formaPago = "QR" } | ConvertTo-Json) | Out-Null
$pagoSec = ((Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h).pagos | Where-Object { [decimal]$_.monto -eq 1000 -and -not $_.anuladoAt })[0]
Esperar-Error { Invoke-RestMethod -Uri "$base/cobros/pagos/$($pagoSec.id)/anular" -Method Post -Headers $hSec -ContentType "application/json" -Body '{}' } 403 "4 SECRETARIA ANULA"

# 5) Pago completo del saldo -> COBRADO; anularlo -> CON_DEUDA y saldo restaurado
$cobroAct = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h
Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = $cobroAct.saldoPendiente; formaPago = "EFECTIVO" } | ConvertTo-Json) | Out-Null
$pagoFinal = ((Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h).pagos | Where-Object { [decimal]$_.monto -eq [decimal]$cobroAct.saldoPendiente -and -not $_.anuladoAt -and -not $_.reversaDeId })[0]
$res5 = Invoke-RestMethod -Uri "$base/cobros/pagos/$($pagoFinal.id)/anular" -Method Post -Headers $h -ContentType "application/json" -Body '{}'
$citasHoy = Invoke-RestMethod -Uri "$base/citas?fecha=$(Get-Date -Format 'yyyy-MM-dd')" -Headers $h
$citaTras = $citasHoy | Where-Object { $_.id -eq $cita.id }
Write-Output "5 ANULAR COMPLETO: cobro=$($res5.estado) (esp PARCIAL, queda el pago QR) cita=$($citaTras.estado) (esp CON_DEUDA) saldo=$($res5.saldoPendiente) (esp 4000)"
