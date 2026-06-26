# Gate editar cita: cambio de servicio (particular), recalculo de cobro, guard de
# estado, y rechazo de pagos > nuevo total. API en :3000.
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "editcita$ts@test.com"

function Esperar-Error($accion, $codigoEsperado, $etiqueta) {
  try { & $accion | Out-Null; Write-Output "$etiqueta : FALLO (no dio error, esperado $codigoEsperado)" }
  catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq $codigoEsperado) { Write-Output "$etiqueta : OK ($status)" }
    else { Write-Output "$etiqueta : FALLO (dio $status, esperado $codigoEsperado)" }
  }
}

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" `
  -Body (@{ consultorioNombre = "EditGate $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$tc = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h
$tcEfectivo = ($tc | Where-Object { $_.esEfectivo })[0].id
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null

$svcA = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Consulta A $ts"; duracionMin = 30; precioBase = 100 } | ConvertTo-Json)
$svcB = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Consulta B $ts"; duracionMin = 45; precioBase = 250 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Dr Edit $ts" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Pac"; apellido = "Edit $ts" } | ConvertTo-Json)
$manana = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")

# ---- S1: cambiar servicio (particular) recalcula el cobro ----
$cita1 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svcA.id; fechaHora = "${manana}T09:00:00Z" } | ConvertTo-Json)
$cobro1a = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita1.id)" -Headers $h
Invoke-RestMethod -Uri "$base/citas/$($cita1.id)/editar" -Method Put -Headers $h -ContentType "application/json" `
  -Body (@{ servicioId = $svcB.id } | ConvertTo-Json) | Out-Null
$cobro1b = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita1.id)" -Headers $h
$total1 = [double]$cobro1b.total
$sum1 = [double](($cobro1b.detalles | Measure-Object -Property subtotal -Sum).Sum)
if ($total1 -eq 250 -and [math]::Round($sum1,2) -eq 250) {
  Write-Output "S1 CAMBIO SERVICIO: OK (total $($cobro1a.total)->$total1 SUM=$sum1)"
} else { Write-Output "S1 CAMBIO SERVICIO: FALLO (total=$total1 SUM=$sum1 esperado 250)" }

# ---- S2: editar en estado no editable (COBRADO) -> 400 ----
# Llevar la cita a ATENDIDA y cobrar total para que quede COBRADO
foreach ($e in @("CONFIRMADA","LLEGO","EN_ATENCION","ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita1.id)/estado" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
Invoke-RestMethod -Uri "$base/cobros/$($cobro1b.id)/pagos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ monto = 250; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
Esperar-Error {
  Invoke-RestMethod -Uri "$base/citas/$($cita1.id)/editar" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ servicioId = $svcA.id } | ConvertTo-Json)
} 400 "S2 EDITAR EN COBRADO"

# ---- S3: editar en ATENDIDA con pago parcial -> rechaza bajar total por debajo de lo pagado ----
$cita3 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svcB.id; fechaHora = "${manana}T10:00:00Z" } | ConvertTo-Json)
foreach ($e in @("CONFIRMADA","LLEGO","EN_ATENCION","ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita3.id)/estado" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$cobro3 = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita3.id)" -Headers $h
# pago parcial 150 de 250
Invoke-RestMethod -Uri "$base/cobros/$($cobro3.id)/pagos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ monto = 150; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
# bajar a svcA (100) < pagado (150) -> 400
Esperar-Error {
  Invoke-RestMethod -Uri "$base/citas/$($cita3.id)/editar" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ servicioId = $svcA.id } | ConvertTo-Json)
} 400 "S3 EDITAR BAJO LO PAGADO"

# ---- S4: prender seguro sin que el paciente tenga seguro -> 400 ----
Esperar-Error {
  Invoke-RestMethod -Uri "$base/citas/$($cita3.id)/editar" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ usaSeguro = $true } | ConvertTo-Json)
} 400 "S4 SEGURO SIN CONFIG PACIENTE"

Write-Output "GATE editar-cita: FIN"
