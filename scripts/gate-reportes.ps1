# Gate item 29: reporte mensual + desglose por doctor (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "rep$ts@test.com"
$mes = Get-Date -Format "yyyy-MM"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "REP $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$docA = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Alfa"; comisionPct = 20 } | ConvertTo-Json)
$docB = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Beta" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Renata"; apellido = "Reporte" } | ConvertTo-Json)

function Nueva-Cita($hora, $doctorId) {
  $fh = (Get-Date -Hour $hora -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doctorId; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
}

# Cita de Alfa: atendida y cobrada 600 efectivo + 400 QR
$c1 = Nueva-Cita 9 $docA.id
foreach ($estado in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($c1.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $estado } | ConvertTo-Json) | Out-Null
}
$cobro1 = Invoke-RestMethod -Uri "$base/cobros/cita/$($c1.id)" -Headers $h
Invoke-RestMethod -Uri "$base/cobros/$($cobro1.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 600; formaPago = "EFECTIVO" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/cobros/$($cobro1.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 400; formaPago = "QR" } | ConvertTo-Json) | Out-Null

# Cita de Beta: cancelada
$c2 = Nueva-Cita 14 $docB.id
Invoke-RestMethod -Uri "$base/citas/$($c2.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "CANCELADA"; motivo = "gate" } | ConvertTo-Json) | Out-Null

# Gasto en efectivo 150
Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = (Get-Date -Format "yyyy-MM-dd"); categoria = "INSUMOS"; monto = 150; descripcion = "gasa"; cuenta = "CAJA_EFECTIVO" } | ConvertTo-Json) | Out-Null

# 1) Reporte del mes
$r = Invoke-RestMethod -Uri "$base/reportes/mensual?mes=$mes" -Headers $h
Write-Output "1 INGRESOS: total=$($r.ingresos.total) (esp 1000) efectivo=$($r.ingresos.porFormaPago.EFECTIVO) (esp 600) qr=$($r.ingresos.porFormaPago.QR) (esp 400)"
Write-Output "2 GASTOS Y NETO: gastos=$($r.gastos.total) (esp 150) neto=$($r.resultadoNeto) (esp 850)"
Write-Output "3 CITAS: total=$($r.citas.total) (esp 2) canceladas=$($r.citas.porEstado.CANCELADA) (esp 1)"

# 4) Por doctor: Alfa con ingresos 1000 y 1 paciente; Beta con 1 cancelada
$alfa = @($r.porDoctor) | Where-Object { $_.doctorId -eq $docA.id }
$beta = @($r.porDoctor) | Where-Object { $_.doctorId -eq $docB.id }
Write-Output "4 ALFA: atendidas=$($alfa.citasAtendidas) pacientes=$($alfa.pacientesAtendidos) ingresos=$($alfa.ingresos) (esp 1 1 1000)"
Write-Output "5 BETA: canceladas=$($beta.canceladas) ingresos=$($beta.ingresos) (esp 1 0)"

# 5b) Comision (item 21): Alfa 20% de 1000 = 200; Beta sin comision -> null
Write-Output "5b COMISION: alfa=$($alfa.comision) (esp 200) beta=$($null -eq $beta.comision) (esp True) total=$($r.totalComisiones) (esp 200)"

# 6) SECRETARIA -> 403 (solo ADMIN)
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
Esperar-Error { Invoke-RestMethod -Uri "$base/reportes/mensual" -Headers @{ Authorization = "Bearer $($loginSec.accessToken)" } } 403 "6 SECRETARIA"

# 7) Mes invalido -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/reportes/mensual?mes=2026-13" -Headers $h } 400 "7 MES INVALIDO"

# 8) Una anulacion descuenta del reporte (reversa negativa)
$cobroFull = Invoke-RestMethod -Uri "$base/cobros/cita/$($c1.id)" -Headers $h
$pagoQr = @($cobroFull.pagos) | Where-Object { $_.formaPago -eq 'QR' -and [decimal]$_.monto -gt 0 } | Select-Object -First 1
if ($pagoQr) {
  Invoke-RestMethod -Uri "$base/cobros/pagos/$($pagoQr.id)/anular" -Method Post -Headers $h -ContentType "application/json" -Body (@{ motivo = "gate reporte" } | ConvertTo-Json) | Out-Null
  $r2 = Invoke-RestMethod -Uri "$base/reportes/mensual?mes=$mes" -Headers $h
  Write-Output "8 TRAS ANULAR QR: total=$($r2.ingresos.total) (esp 600) qr=$($r2.ingresos.porFormaPago.QR) (esp 0)"
} else {
  Write-Output "8 TRAS ANULAR QR: SKIP (no se encontro el pago QR via GET pagos)"
}
