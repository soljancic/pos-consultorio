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
$tiposCuenta = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h; $tcEfectivo = ($tiposCuenta | Where-Object { $_.esEfectivo }).id; $tcQr = ($tiposCuenta | Where-Object { $_.nombre -eq "QR" }).id
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
Invoke-RestMethod -Uri "$base/cobros/$($cobro1.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 600; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/cobros/$($cobro1.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 400; tipoCuentaId = $tcQr } | ConvertTo-Json) | Out-Null

# Cita de Beta: cancelada
$c2 = Nueva-Cita 14 $docB.id
Invoke-RestMethod -Uri "$base/citas/$($c2.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "CANCELADA"; motivo = "gate" } | ConvertTo-Json) | Out-Null

# Gasto en efectivo 150
$tiposGasto = Invoke-RestMethod -Uri "$base/tipos-gasto" -Headers $h
$tiposCuenta = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h
$tgInsumos = ($tiposGasto | Where-Object { $_.nombre -eq 'Insumos' }).id
$tgOtros = ($tiposGasto | Where-Object { $_.nombre -eq 'Otros' }).id
$tcEfectivo = ($tiposCuenta | Where-Object { $_.esEfectivo }).id
$tcBanco = ($tiposCuenta | Where-Object { $_.nombre -eq 'Banco' }).id
Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = (Get-Date -Format "yyyy-MM-dd"); tipoGastoId = $tgInsumos; monto = 150; descripcion = "gasa"; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null

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
$pagoQr = @($cobroFull.pagos) | Where-Object { $_.tipoCuenta.nombre -eq 'QR' -and [decimal]$_.monto -gt 0 } | Select-Object -First 1
if ($pagoQr) {
  Invoke-RestMethod -Uri "$base/cobros/pagos/$($pagoQr.id)/anular" -Method Post -Headers $h -ContentType "application/json" -Body (@{ motivo = "gate reporte" } | ConvertTo-Json) | Out-Null
  $r2 = Invoke-RestMethod -Uri "$base/reportes/mensual?mes=$mes" -Headers $h
  Write-Output "8 TRAS ANULAR QR: total=$($r2.ingresos.total) (esp 600) qr=$($r2.ingresos.porFormaPago.QR) (esp 0)"
} else {
  Write-Output "8 TRAS ANULAR QR: SKIP (no se encontro el pago QR via GET pagos)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Fase 1 — 5 endpoints de reportes (Tasks 4-8)
# Reutiliza el tenant ya creado arriba (mismo $h / $hoy).
# DOCTOR: crea usuario DOCTOR vinculado al doctor del tenant.
# ═══════════════════════════════════════════════════════════════════════════════
$hoy = (Get-Date).ToString("yyyy-MM-dd")
$emailDoc = "repdoc$ts@test.com"

# Crear usuario DOCTOR en el tenant existente y vincularlo a $docA
$nuevoDocUsuario = Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Doctor Usuario $ts"; email = $emailDoc; password = "Password123!"; rol = "DOCTOR" } | ConvertTo-Json)
Invoke-RestMethod -Uri "$base/doctores/$($docA.id)" -Method Put -Headers $h -ContentType "application/json" `
  -Body (@{ usuarioId = $nuevoDocUsuario.id } | ConvertTo-Json) | Out-Null
$loginDoc = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $emailDoc; password = "Password123!" } | ConvertTo-Json)
$hDoc = @{ Authorization = "Bearer $($loginDoc.accessToken)" }
Write-Output ""
Write-Output "=== SETUP DOCTOR OK ==="

# ─── Task 4: /reportes/citas ────────────────────────────────────────────────
Write-Output ""
Write-Output "--- CITAS ---"

Esperar-Error { Invoke-RestMethod -Uri "$base/reportes/citas" -Headers $h } 400 "CITAS 400 sin fechas"

$citas = Invoke-RestMethod -Uri "$base/reportes/citas?desde=$hoy&hasta=$hoy" -Headers $h
$citasShape = ($null -ne $citas.kpis) -and ($null -ne $citas.rows) -and ($null -ne $citas.page) -and ($null -ne $citas.pageSize) -and ($null -ne $citas.total)
Write-Output "CITAS 200 shape: $citasShape (esp True)"

$kpiKeys = @($citas.kpis) | ForEach-Object { $_.key }
$ck_total     = $kpiKeys -contains 'total'
$ck_atend     = $kpiKeys -contains 'atendidas'
$ck_cancel    = $kpiKeys -contains 'canceladas'
$ck_noasist   = $kpiKeys -contains 'no_asistio'
$ck_ingresos  = $kpiKeys -contains 'ingresos'
Write-Output "CITAS KPIs: total=$ck_total atendidas=$ck_atend canceladas=$ck_cancel no_asistio=$ck_noasist ingresos=$ck_ingresos (todos esp True)"

$citasDoc = Invoke-RestMethod -Uri "$base/reportes/citas?desde=$hoy&hasta=$hoy" -Headers $hDoc
Write-Output "CITAS DOCTOR 200: ok=$($null -ne $citasDoc.kpis) (esp True)"

# DOCTOR escopeado: solo ve citas de su doctor (docA); Beta no deberia aparecer en rows del DOCTOR
$citasDocRows = @($citasDoc.rows)
$doctoresEnDocRows = $citasDocRows | ForEach-Object { $_.doctor } | Sort-Object -Unique
Write-Output "CITAS DOCTOR scope: doctores en rows=$($doctoresEnDocRows -join ',') (esp solo Dr. Alfa o vacio)"

# ─── Task 5: /reportes/cobranzas ────────────────────────────────────────────
Write-Output ""
Write-Output "--- COBRANZAS ---"

Esperar-Error { Invoke-RestMethod -Uri "$base/reportes/cobranzas" -Headers $h } 400 "COBRANZAS 400 sin fechas"

$cobr = Invoke-RestMethod -Uri "$base/reportes/cobranzas?desde=$hoy&hasta=$hoy" -Headers $h
$cobrShape = ($null -ne $cobr.kpis) -and ($null -ne $cobr.rows) -and ($null -ne $cobr.page) -and ($null -ne $cobr.total)
Write-Output "COBRANZAS 200 shape: $cobrShape (esp True)"

$cobrKeys = @($cobr.kpis) | ForEach-Object { $_.key }
$cok_total    = $cobrKeys -contains 'total'
$cok_efect    = $cobrKeys -contains 'efectivo'
$cok_noEfect  = $cobrKeys -contains 'no_efectivo'
$cok_deuda    = $cobrKeys -contains 'deuda'
Write-Output "COBRANZAS KPIs: total=$cok_total efectivo=$cok_efect no_efectivo=$cok_noEfect deuda=$cok_deuda (todos esp True)"

$tieneCuentas = ($null -ne $cobr.meta) -and ($null -ne $cobr.meta.cuentas)
Write-Output "COBRANZAS meta.cuentas array: $tieneCuentas (esp True)"

$cobrDoc = Invoke-RestMethod -Uri "$base/reportes/cobranzas?desde=$hoy&hasta=$hoy" -Headers $hDoc
Write-Output "COBRANZAS DOCTOR 200: ok=$($null -ne $cobrDoc.kpis) (esp True)"

# ─── Task 6: /reportes/gastos ───────────────────────────────────────────────
Write-Output ""
Write-Output "--- GASTOS ---"

Esperar-Error { Invoke-RestMethod -Uri "$base/reportes/gastos" -Headers $h } 400 "GASTOS 400 sin fechas"

$gast = Invoke-RestMethod -Uri "$base/reportes/gastos?desde=$hoy&hasta=$hoy" -Headers $h
$gastShape = ($null -ne $gast.kpis) -and ($null -ne $gast.rows) -and ($null -ne $gast.total)
Write-Output "GASTOS 200 shape: $gastShape (esp True)"

$gastKeys = @($gast.kpis) | ForEach-Object { $_.key }
$gk_total    = $gastKeys -contains 'total'
$gk_utilidad = $gastKeys -contains 'utilidad'
Write-Output "GASTOS KPIs: total=$gk_total utilidad=$gk_utilidad (todos esp True)"

$tienePorCat = ($null -ne $gast.meta) -and ($null -ne $gast.meta.porCategoria)
$tienePorFP  = ($null -ne $gast.meta) -and ($null -ne $gast.meta.porFormaPago)
Write-Output "GASTOS meta: porCategoria=$tienePorCat porFormaPago=$tienePorFP (todos esp True)"

Esperar-Error { Invoke-RestMethod -Uri "$base/reportes/gastos?desde=$hoy&hasta=$hoy" -Headers $hDoc } 403 "GASTOS DOCTOR 403"

# ─── Task 7: /reportes/pacientes ────────────────────────────────────────────
Write-Output ""
Write-Output "--- PACIENTES ---"

Esperar-Error { Invoke-RestMethod -Uri "$base/reportes/pacientes" -Headers $h } 400 "PACIENTES 400 sin fechas"

$pacs = Invoke-RestMethod -Uri "$base/reportes/pacientes?desde=$hoy&hasta=$hoy" -Headers $h
$pacsShape = ($null -ne $pacs.kpis) -and ($null -ne $pacs.rows) -and ($null -ne $pacs.total)
Write-Output "PACIENTES 200 shape: $pacsShape (esp True)"

$pacsKeys = @($pacs.kpis) | ForEach-Object { $_.key }
$pk_nuevos = $pacsKeys -contains 'nuevos'
$pk_recur  = $pacsKeys -contains 'recurrentes'
$pk_deuda  = $pacsKeys -contains 'con_deuda'
$pk_inact  = $pacsKeys -contains 'inactivos'
Write-Output "PACIENTES KPIs: nuevos=$pk_nuevos recurrentes=$pk_recur con_deuda=$pk_deuda inactivos=$pk_inact (todos esp True)"

$pacsDoc = Invoke-RestMethod -Uri "$base/reportes/pacientes?desde=$hoy&hasta=$hoy" -Headers $hDoc
Write-Output "PACIENTES DOCTOR 200: ok=$($null -ne $pacsDoc.kpis) (esp True)"

# ─── Task 8: /reportes/servicios ────────────────────────────────────────────
Write-Output ""
Write-Output "--- SERVICIOS ---"

Esperar-Error { Invoke-RestMethod -Uri "$base/reportes/servicios" -Headers $h } 400 "SERVICIOS 400 sin fechas"

$serv = Invoke-RestMethod -Uri "$base/reportes/servicios?desde=$hoy&hasta=$hoy" -Headers $h
$servShape = ($null -ne $serv.kpis) -and ($null -ne $serv.rows) -and ($null -ne $serv.total)
Write-Output "SERVICIOS 200 shape: $servShape (esp True)"

$servKeys = @($serv.kpis) | ForEach-Object { $_.key }
$sk_masVend = $servKeys -contains 'mas_vendido'
$sk_mayIng  = $servKeys -contains 'mayor_ingreso'
$sk_sinMov  = $servKeys -contains 'sin_movimiento'
Write-Output "SERVICIOS KPIs: mas_vendido=$sk_masVend mayor_ingreso=$sk_mayIng sin_movimiento=$sk_sinMov (todos esp True)"

$servDoc = Invoke-RestMethod -Uri "$base/reportes/servicios?desde=$hoy&hasta=$hoy" -Headers $hDoc
Write-Output "SERVICIOS DOCTOR 200: ok=$($null -ne $servDoc.kpis) (esp True)"

Write-Output ""
Write-Output "=== gate-reportes Fase 1 DONE ==="
