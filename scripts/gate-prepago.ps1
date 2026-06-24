# Gate prepago: total, auto-COBRADO, no-show, devolucion (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "prepago$ts@test.com"

# Register tenant + login
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "Prepago $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# Get tipoCuenta efectivo for pago recording
$tiposCuenta = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h
$tcEfectivo = ($tiposCuenta | Where-Object { $_.esEfectivo }).id

# Open caja (required for all prepago scenarios)
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 1000 } | ConvertTo-Json) | Out-Null

# Create service, doctor, and patient (reused for all scenarios)
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta Prepago"; duracionMin = 30; precioBase = 500 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Prepago" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Pac"; apellido = "Prepago" } | ConvertTo-Json)

# Helper functions
function Estado($id) { (Invoke-RestMethod -Uri "$base/citas/$id" -Headers $h).estado }
function CobroDe($id) { Invoke-RestMethod -Uri "$base/cobros/cita/$id" -Headers $h }
function CajaDe($h) { (Invoke-RestMethod -Uri "$base/caja/hoy" -Headers $h).caja }

# ============ SCENARIO 1: Prepago total ============
# Create cita for tomorrow at 09:00
$manana = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$fh1 = "${manana}T09:00:00Z"
$cita1 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh1 } | ConvertTo-Json)
$cobro1 = CobroDe $cita1.id
if ($cobro1.estado -ne 'PENDIENTE') { throw "FAIL S1: cobro debe estar PENDIENTE al crear cita ($(cobro1.estado))" }

# Register full payment
$cajaAntesS1 = CajaDe $h
Invoke-RestMethod -Uri "$base/cobros/$($cobro1.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 500; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
$cobro1After = CobroDe $cita1.id
if ($cobro1After.estado -ne 'COMPLETO') { throw "FAIL S1: cobro debe ser COMPLETO despues del prepago ($($cobro1After.estado))" }
if ($cobro1After.saldoPendiente -ne 0) { throw "FAIL S1: saldoPendiente debe ser 0 (es $($cobro1After.saldoPendiente))" }
if ((Estado $cita1.id) -ne 'PENDIENTE') { throw "FAIL S1: cita debe seguir PENDIENTE despues del prepago ($(Estado $cita1.id))" }
$cajaAfterS1 = CajaDe $h
if ($cajaAfterS1.totalEfectivo -le $cajaAntesS1.totalEfectivo) { throw "FAIL S1: caja debe haber subido con el prepago" }
Write-Host "1 PREPAGO TOTAL: PASS" -ForegroundColor Green

# ============ SCENARIO 2: Auto-COBRADO al atender ============
# Create new cita for a different time
$fh2 = "${manana}T10:00:00Z"
$cita2 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh2 } | ConvertTo-Json)
$cobro2 = CobroDe $cita2.id

# Register full prepayment
Invoke-RestMethod -Uri "$base/cobros/$($cobro2.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 500; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null

# Drive state machine to ATENDIDA
foreach ($e in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita2.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}

# After ATENDIDA, should auto-transition to COBRADO
$estadoFinal = Estado $cita2.id
if ($estadoFinal -ne 'COBRADO') { throw "FAIL S2: cita debe ser COBRADO despues de ATENDIDA (es $estadoFinal)" }
Write-Host "2 AUTO-COBRADO: PASS" -ForegroundColor Green

# ============ SCENARIO 3: Seña + cobrar resto ============
# Create new cita at 11:00
$fh3 = "${manana}T11:00:00Z"
$cita3 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh3 } | ConvertTo-Json)
$cobro3 = CobroDe $cita3.id

# Register 50% payment (seña)
Invoke-RestMethod -Uri "$base/cobros/$($cobro3.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 250; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
$cobro3After = CobroDe $cita3.id
if ($cobro3After.estado -ne 'PARCIAL') { throw "FAIL S3a: cobro debe ser PARCIAL tras pago parcial (es $($cobro3After.estado))" }
if ($cobro3After.saldoPendiente -ne 250) { throw "FAIL S3a: saldoPendiente debe ser 250 (es $($cobro3After.saldoPendiente))" }
if ((Estado $cita3.id) -ne 'PENDIENTE') { throw "FAIL S3a: la cita debe seguir PENDIENTE (el prepago parcial no cambia el estado): es $(Estado $cita3.id)" }

# Drive to ATENDIDA
foreach ($e in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita3.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}

# After ATENDIDA with saldo pending, should be ATENDIDA (not auto-COBRADO)
$estadoS3After = Estado $cita3.id
if ($estadoS3After -ne 'ATENDIDA') { throw "FAIL S3b: cita debe ser ATENDIDA si hay saldo pendiente (es $estadoS3After)" }

# Pay the rest
$cobro3Id = (CobroDe $cita3.id).id
Invoke-RestMethod -Uri "$base/cobros/$cobro3Id/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 250; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
$cobro3Final = CobroDe $cita3.id
if ($cobro3Final.estado -ne 'COMPLETO') { throw "FAIL S3c: cobro debe ser COMPLETO despues de pagar el resto (es $($cobro3Final.estado))" }

# After full payment, cita should transition to COBRADO
$estadoS3Final = Estado $cita3.id
if ($estadoS3Final -ne 'COBRADO') { throw "FAIL S3c: cita debe ser COBRADO despues de pagar todo (es $estadoS3Final)" }
Write-Host "3 SENA + COBRAR RESTO: PASS" -ForegroundColor Green

# ============ SCENARIO 4: No-show conserva dinero ============
# Create new cita at 12:00
$fh4 = "${manana}T12:00:00Z"
$cita4 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh4 } | ConvertTo-Json)
$cobro4 = CobroDe $cita4.id

# Register full prepayment
Invoke-RestMethod -Uri "$base/cobros/$($cobro4.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 500; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
$cajaAntesS4 = CajaDe $h

# Mark as NO_ASISTIO
Invoke-RestMethod -Uri "$base/citas/$($cita4.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "NO_ASISTIO" } | ConvertTo-Json) | Out-Null

# Verify: cobro ANULADO but caja still same
$cobro4After = CobroDe $cita4.id
if ($cobro4After.estado -ne 'ANULADO') { throw "FAIL S4: cobro debe ser ANULADO tras NO_ASISTIO (es $($cobro4After.estado))" }
$cajaAfterS4 = CajaDe $h
if ($cajaAfterS4.totalEfectivo -ne $cajaAntesS4.totalEfectivo) { throw "FAIL S4: caja debe conservar dinero en NO_ASISTIO (antes=$($cajaAntesS4.totalEfectivo) despues=$($cajaAfterS4.totalEfectivo))" }
Write-Host "4 NO-SHOW CONSERVA: PASS" -ForegroundColor Green

# ============ SCENARIO 5: Cancelación + devolver ============
# Create new cita at 13:00
$fh5 = "${manana}T13:00:00Z"
$cita5 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh5 } | ConvertTo-Json)
$cobro5 = CobroDe $cita5.id

# Register full prepayment
Invoke-RestMethod -Uri "$base/cobros/$($cobro5.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 500; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
$cajaAntesS5 = CajaDe $h

# Devolver (reversal)
Invoke-RestMethod -Uri "$base/cobros/cita/$($cita5.id)/devolver" -Method Post -Headers $h -ContentType "application/json" -Body (@{ motivo = "Cambio de planes" } | ConvertTo-Json) | Out-Null

# Cancel the cita
Invoke-RestMethod -Uri "$base/citas/$($cita5.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "CANCELADA" } | ConvertTo-Json) | Out-Null

# Verify: cobro ANULADO, caja dropped, pago de reversa exists
$cobro5After = CobroDe $cita5.id
if ($cobro5After.estado -ne 'ANULADO') { throw "FAIL S5: cobro debe ser ANULADO tras devolver (es $($cobro5After.estado))" }
$cajaAfterS5 = CajaDe $h
if ($cajaAfterS5.totalEfectivo -ge $cajaAntesS5.totalEfectivo) { throw "FAIL S5: caja debe haber bajado tras devolver (antes=$($cajaAntesS5.totalEfectivo) despues=$($cajaAfterS5.totalEfectivo))" }
Write-Host "5 DEVOLVER: PASS" -ForegroundColor Green

# ============ SCENARIO 6: Cancelación + mantener (sin devolver) ============
# Create new cita at 14:00
$fh6 = "${manana}T14:00:00Z"
$cita6 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh6 } | ConvertTo-Json)
$cobro6 = CobroDe $cita6.id

# Register full prepayment
Invoke-RestMethod -Uri "$base/cobros/$($cobro6.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 500; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
$cajaAntesS6 = CajaDe $h

# Cancel WITHOUT devolver
Invoke-RestMethod -Uri "$base/citas/$($cita6.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "CANCELADA" } | ConvertTo-Json) | Out-Null

# Verify: cobro ANULADO but caja unchanged (money retained)
$cobro6After = CobroDe $cita6.id
if ($cobro6After.estado -ne 'ANULADO') { throw "FAIL S6: cobro debe ser ANULADO tras CANCELADA (es $($cobro6After.estado))" }
$cajaAfterS6 = CajaDe $h
if ($cajaAfterS6.totalEfectivo -ne $cajaAntesS6.totalEfectivo) { throw "FAIL S6: caja debe conservar dinero sin devolver (antes=$($cajaAntesS6.totalEfectivo) despues=$($cajaAfterS6.totalEfectivo))" }
Write-Host "6 CANCELAR SIN DEVOLVER: PASS" -ForegroundColor Green

# ============ SCENARIO 7: No es deuda (prepago parcial NO aparece en deudores) ============
# Crea una cita fresca (15:00) con pago parcial y verifica que NO aparezca en /cobros/deudores.
# Deudores = citas ATENDIDA/CON_DEUDA sin pago; un prepago parcial pre-atencion NO es deuda real.
$fh7 = "${manana}T15:00:00Z"
$cita7 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh7 } | ConvertTo-Json)
$cobro7 = CobroDe $cita7.id

# Pago parcial (50%)
Invoke-RestMethod -Uri "$base/cobros/$($cobro7.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 250; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
$cobro7After = CobroDe $cita7.id
if ($cobro7After.estado -ne 'PARCIAL') { throw "FAIL S7: cobro debe ser PARCIAL tras pago parcial (es $($cobro7After.estado))" }
if ((Estado $cita7.id) -ne 'PENDIENTE') { throw "FAIL S7: cita debe seguir PENDIENTE tras prepago parcial (es $(Estado $cita7.id))" }

# La cita con prepago parcial pre-atencion NO debe aparecer en deudores
$deudores = Invoke-RestMethod -Uri "$base/cobros/deudores" -Headers $h
$esDeudora = @($deudores) | Where-Object { $_.citaId -eq $cita7.id }
if (@($esDeudora).Count -gt 0) { throw "FAIL S7: cita prepagada parcial no debe aparecer en deudores" }
Write-Host "7 PREPAGO NO ES DEUDA: PASS" -ForegroundColor Green

Write-Host "GATE prepago: PASS" -ForegroundColor Green
