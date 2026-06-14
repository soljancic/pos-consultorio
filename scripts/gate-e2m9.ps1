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

# Catalogos default sembrados al registrar; mapear nombre -> id
$tiposGasto = Invoke-RestMethod -Uri "$base/tipos-gasto" -Headers $h
$tiposCuenta = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h
$tgInsumos = ($tiposGasto | Where-Object { $_.nombre -eq 'Insumos' }).id
$tgOtros = ($tiposGasto | Where-Object { $_.nombre -eq 'Otros' }).id
$tcEfectivo = ($tiposCuenta | Where-Object { $_.esEfectivo }).id
$tcBanco = ($tiposCuenta | Where-Object { $_.nombre -eq 'Banco' }).id

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
Esperar-Error { Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 500; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) } 409 "1 COBRAR SIN CAJA"
Esperar-Error { Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; tipoGastoId = $tgOtros; monto = 100; descripcion = "x"; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) } 409 "2 GASTAR SIN CAJA"

# 3) Abrir con caja chica 100; re-abrir -> 400
$ap = Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 100; notasApertura = "gate" } | ConvertTo-Json)
Write-Output "3 ABRIR: inicial=$($ap.montoInicial) (esp 100) abierta=$($null -ne $ap.abiertaAt) (esp True)"
Esperar-Error { Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) } 400 "4 RE-ABRIR"

# 5) Con caja abierta: cobrar 2000 efectivo + gasto 500 efectivo
Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 2000; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; tipoGastoId = $tgInsumos; monto = 500; descripcion = "gasas"; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null

# 5b) Email de cierre configurado: el cierre debe responder OK igual (el envio
# es fire-and-forget; con o sin Resend no rompe ni demora el cierre)
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ emailCierreCaja = "cierres$ts@test.com" } | ConvertTo-Json) | Out-Null
$cfg = Invoke-RestMethod -Uri "$base/consultorio" -Headers $h
Write-Output "5b EMAIL CIERRE CONFIG: emailCierreCaja=$($cfg.emailCierreCaja) (esp cierres$ts@test.com)"

# 6) Arqueo con inicial: esperado = 100 + 2000 - 500 = 1600 -> diferencia 0
$cierre = Invoke-RestMethod -Uri "$base/caja/cerrar" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoDeclarado = 1600 } | ConvertTo-Json)
Write-Output "6 ARQUEO CON INICIAL: esperado=$($cierre.montoEsperado) (esp 1600) diferencia=$($cierre.diferencia) (esp 0) auto=$($null -ne $cierre.revisadaAt) (esp True) cierreConEmail=OK"

# 7) Tras el cierre: cobrar/gastar -> 409 (turno terminado)
Esperar-Error { Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; tipoGastoId = $tgOtros; monto = 50; descripcion = "y"; tipoCuentaId = $tcBanco } | ConvertTo-Json) } 409 "7 GASTAR TRAS CIERRE"

# 8) Reabrir (ADMIN): el arqueo se descarta y la caja vuelve a aceptar dinero
$re = Invoke-RestMethod -Uri "$base/caja/reabrir" -Method Post -Headers $h
Write-Output "8 REABRIR: cerrada=$($re.cerrada) (esp False) declarado=$($re.montoDeclarado) (esp vacio)"
Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; tipoGastoId = $tgOtros; monto = 50; descripcion = "post-reapertura"; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
Write-Output "9 GASTO TRAS REAPERTURA: OK"

# 9c) Limpiar el email de cierre ('' lo desactiva): el re-cierre sigue OK
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ emailCierreCaja = "" } | ConvertTo-Json) | Out-Null
$cfg2 = Invoke-RestMethod -Uri "$base/consultorio" -Headers $h
Write-Output "9c EMAIL CIERRE LIMPIO: vacio=$([string]::IsNullOrEmpty($cfg2.emailCierreCaja)) (esp True)"

# 10) Re-cierre: esperado = 1600 - 50 = 1550 -> diferencia 0
$cierre2 = Invoke-RestMethod -Uri "$base/caja/cerrar" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoDeclarado = 1550 } | ConvertTo-Json)
Write-Output "10 RE-CIERRE: esperado=$($cierre2.montoEsperado) (esp 1550) diferencia=$($cierre2.diferencia) (esp 0) cierreSinEmail=OK"
