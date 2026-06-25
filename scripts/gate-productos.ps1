# Gate productos: vendeProductos, CRUD, venta mixta, venta directa contado/deuda,
# stock, sobrepago (API en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "productos$ts@test.com"

# Helper: assert que una llamada devuelve el codigo HTTP esperado (no lanza)
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

# ---- Setup: tenant fresco ----
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" `
  -Body (@{ consultorioNombre = "ProdGate $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null

$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# tipoCuenta efectivo (seeded en el tenant por default)
$tiposCuenta = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h
$tcEfectivo = ($tiposCuenta | Where-Object { $_.esEfectivo }).id

# Abrir caja (obligatorio para registrar pagos y crear ventas directas)
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null

# ====================================================================
# ESCENARIO 1: Toggle vendeProductos=true via PUT /consultorio
#              Re-login y assert user.vendeProductos === true
# ====================================================================
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" `
  -Body (@{ vendeProductos = $true } | ConvertTo-Json) | Out-Null

$loginPost = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$vende = $loginPost.user.vendeProductos
if ($vende -eq $true) { Write-Output "1 TOGGLE vendeProductos: OK (vendeProductos=$vende)" }
else { Write-Output "1 TOGGLE vendeProductos: FALLO (vendeProductos=$vende, esperado true)" }
$h = @{ Authorization = "Bearer $($loginPost.accessToken)" }

# ====================================================================
# ESCENARIO 2: POST /productos (vendible + insumo)
#              GET /productos/vendibles devuelve solo el vendible
# ====================================================================
$prodVendible = Invoke-RestMethod -Uri "$base/productos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Gel $ts"; precioVenta = 50; precioCosto = 20; stockActual = 10; controlaStock = $true; habilitadoVenta = $true } | ConvertTo-Json)

$prodInsumo = Invoke-RestMethod -Uri "$base/productos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Insumo $ts"; precioVenta = 10; precioCosto = 5; stockActual = 100; habilitadoVenta = $false } | ConvertTo-Json)

$vendibles = Invoke-RestMethod -Uri "$base/productos/vendibles" -Headers $h
$soloVendible = @($vendibles) | Where-Object { $_.id -eq $prodVendible.id }
$insumoEnVendibles = @($vendibles) | Where-Object { $_.id -eq $prodInsumo.id }
$cntV = @($soloVendible).Count
$cntI = @($insumoEnVendibles).Count
if ($cntV -eq 1 -and $cntI -eq 0) {
  Write-Output "2 VENDIBLES FILTER: OK (vendible=$cntV insumo=$cntI)"
} else {
  Write-Output "2 VENDIBLES FILTER: FALLO (vendible=$cntV esperado 1, insumo=$cntI esperado 0)"
}

# ====================================================================
# ESCENARIO 3: Venta mixta — cita + lineas de producto
#              Crear paciente/servicio/cita; mover PENDIENTE->EN_ATENCION->ATENDIDA
#              PUT /cobros/:id/lineas con 2 unidades del vendible
#              Assert: total === precioServicio + 2*precioVenta y SUM(detalles) === total
# ====================================================================
$precioServicio = 200
$precioVenta = 50
$cantLinea = 2
$totalEsperado = $precioServicio + $cantLinea * $precioVenta  # 300

$svc = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Consulta $ts"; duracionMin = 30; precioBase = $precioServicio } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Dr Prod $ts" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Pac"; apellido = "Prod $ts" } | ConvertTo-Json)

$manana = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$fhCita = "${manana}T09:00:00Z"
$cita3 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = $fhCita } | ConvertTo-Json)

# Mover: PENDIENTE -> CONFIRMADA -> LLEGO -> EN_ATENCION -> ATENDIDA
foreach ($e in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita3.id)/estado" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}

$cobro3 = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita3.id)" -Headers $h

# Construir body de lineas: PS 5.1 — ConvertTo-Json colapsa array de 1 elem;
# array de 1 elemento se envuelve en @() pero el workaround es JSON manual.
$lineasJson = "{ ""lineas"": [{ ""productoId"": $($prodVendible.id), ""cantidad"": $cantLinea }] }"
$cobro3c = Invoke-RestMethod -Uri "$base/cobros/$($cobro3.id)/lineas" -Method Put -Headers $h `
  -ContentType "application/json" -Body $lineasJson

$totalActual = [double]$cobro3c.total
$sumaDetalles = ($cobro3c.detalles | Measure-Object -Property subtotal -Sum).Sum
$sumaDetalles = [double]$sumaDetalles
if ([math]::Round($totalActual, 2) -eq $totalEsperado -and [math]::Round($sumaDetalles, 2) -eq $totalEsperado) {
  Write-Output "3 VENTA MIXTA total: OK (total=$totalActual esperado=$totalEsperado SUM(detalles)=$sumaDetalles)"
} else {
  Write-Output "3 VENTA MIXTA total: FALLO (total=$totalActual SUM(detalles)=$sumaDetalles esperado=$totalEsperado)"
}

# ====================================================================
# ESCENARIO 4: Confirmar — POST /cobros/:id/pagos pago total
#              Assert cita COBRADO; GET /productos assert stockActual === 8
# ====================================================================
Invoke-RestMethod -Uri "$base/cobros/$($cobro3.id)/pagos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ monto = $totalEsperado; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null

$cita3Post = Invoke-RestMethod -Uri "$base/citas/$($cita3.id)" -Headers $h
$estadoCita3 = $cita3Post.estado

$productos4 = Invoke-RestMethod -Uri "$base/productos" -Headers $h
$stockPost = ($productos4.items | Where-Object { $_.id -eq $prodVendible.id }).stockActual
$stockEsperado = 10 - $cantLinea  # 8

if ($estadoCita3 -eq 'COBRADO' -and $stockPost -eq $stockEsperado) {
  Write-Output "4 CONFIRMAR + STOCK: OK (cita=$estadoCita3 stock=$stockPost esperado=$stockEsperado)"
} else {
  Write-Output "4 CONFIRMAR + STOCK: FALLO (cita=$estadoCita3 esperado COBRADO; stock=$stockPost esperado=$stockEsperado)"
}

# ====================================================================
# ESCENARIO 5: COBRADO es terminal; reabrir no aplica.
#              Probar que COBRADO no permite nuevos pagos (400).
# ====================================================================
Esperar-Error {
  Invoke-RestMethod -Uri "$base/cobros/$($cobro3.id)/pagos" -Method Post -Headers $h `
    -ContentType "application/json" -Body (@{ monto = 1; tipoCuentaId = $tcEfectivo } | ConvertTo-Json)
} 400 "5 COBRADO TERMINAL (no acepta pagos)"

# ====================================================================
# ESCENARIO 6: PUT /cobros/:id/lineas con producto inexistente -> 400
# ====================================================================
Esperar-Error {
  # Necesita una cita en ATENDIDA para que el endpoint no rechace por estado.
  # Creamos una cita nueva solo para este escenario.
  $fhCita6 = "${manana}T10:00:00Z"
  $cita6 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
    -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = $fhCita6 } | ConvertTo-Json)
  foreach ($e in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA")) {
    Invoke-RestMethod -Uri "$base/citas/$($cita6.id)/estado" -Method Put -Headers $h -ContentType "application/json" `
      -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
  }
  $cobro6 = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita6.id)" -Headers $h
  $lineasInvalidas = "{ ""lineas"": [{ ""productoId"": 999999, ""cantidad"": 1 }] }"
  Invoke-RestMethod -Uri "$base/cobros/$($cobro6.id)/lineas" -Method Put -Headers $h `
    -ContentType "application/json" -Body $lineasInvalidas
} 400 "6 PRODUCTO INEXISTENTE en lineas"

# ====================================================================
# ESCENARIO 7: Venta directa con paciente (deuda)
#              POST /cobros/venta-directa 3 unidades sin pagos
#              Assert: saldo > 0, stock baja, paciente en /cobros/deudores
#              Registrar pago parcial -> deuda baja
#              Anular pago -> deuda sube de nuevo
# ====================================================================
$stockAntes7 = ($prodVendible.stockActual)  # ultimo valor conocido = 8 (post escenario 4)
# Confirmar via API
$productos7pre = Invoke-RestMethod -Uri "$base/productos" -Headers $h
$stockAntes7 = [int]($productos7pre.items | Where-Object { $_.id -eq $prodVendible.id }).stockActual

$cant7 = 3
$totalVD7 = $precioVenta * $cant7  # 150

$lineasVD7 = "{ ""pacienteId"": $($pac.id), ""lineas"": [{ ""productoId"": $($prodVendible.id), ""cantidad"": $cant7 }] }"
$vd7 = Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h `
  -ContentType "application/json" -Body $lineasVD7

$saldo7 = [double]$vd7.saldoPendiente
$productos7post = Invoke-RestMethod -Uri "$base/productos" -Headers $h
$stock7 = [int]($productos7post.items | Where-Object { $_.id -eq $prodVendible.id }).stockActual
$stockEsperado7 = $stockAntes7 - $cant7

$deudores7 = Invoke-RestMethod -Uri "$base/cobros/deudores" -Headers $h
$pacEnDeudores = @($deudores7) | Where-Object { $_.pacienteId -eq $pac.id }
$cntDeudores7 = @($pacEnDeudores).Count

if ($saldo7 -gt 0 -and $stock7 -eq $stockEsperado7 -and $cntDeudores7 -ge 1) {
  Write-Output "7a VD CON PACIENTE (deuda): OK (saldo=$saldo7 stock=$stock7 esperado=$stockEsperado7 pacEnDeudores=$cntDeudores7)"
} else {
  Write-Output "7a VD CON PACIENTE (deuda): FALLO (saldo=$saldo7 stock=$stock7 esperado=$stockEsperado7 pacEnDeudores=$cntDeudores7)"
}

# Pago parcial -> deuda baja
$pagoParcial7 = 50
Invoke-RestMethod -Uri "$base/cobros/$($vd7.id)/pagos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ monto = $pagoParcial7; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null

$vd7post = Invoke-RestMethod -Uri "$base/cobros/$($vd7.id)" -Headers $h
$saldo7post = [double]$vd7post.saldoPendiente
$saldoEsperado7post = $totalVD7 - $pagoParcial7  # 100

if ([math]::Round($saldo7post, 2) -eq $saldoEsperado7post) {
  Write-Output "7b PAGO PARCIAL: OK (saldo=$saldo7post esperado=$saldoEsperado7post)"
} else {
  Write-Output "7b PAGO PARCIAL: FALLO (saldo=$saldo7post esperado=$saldoEsperado7post)"
}

# Anular pago -> deuda sube de nuevo
$pagoId7 = ($vd7post.pagos | Where-Object { $_.monto -gt 0 -and -not $_.anuladoAt })[0].id
Invoke-RestMethod -Uri "$base/cobros/pagos/$pagoId7/anular" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ motivo = "test gate" } | ConvertTo-Json) | Out-Null

$vd7anulado = Invoke-RestMethod -Uri "$base/cobros/$($vd7.id)" -Headers $h
$saldo7anulado = [double]$vd7anulado.saldoPendiente

if ([math]::Round($saldo7anulado, 2) -eq $totalVD7) {
  Write-Output "7c ANULAR PAGO: OK (saldo=$saldo7anulado esperado=$totalVD7)"
} else {
  Write-Output "7c ANULAR PAGO: FALLO (saldo=$saldo7anulado esperado=$totalVD7)"
}

# ====================================================================
# ESCENARIO 8a: Venta directa al contado SIN paciente — pago completo
#               POST /cobros/venta-directa con pagos que cubren el total exacto
#               Assert: 201, saldoPendiente===0, estado===COMPLETO,
#                       stock baja, cobro NO aparece en /cobros/deudores
# ====================================================================
$cant8a = 1
$total8a = $precioVenta * $cant8a  # 50
$productos8apre = Invoke-RestMethod -Uri "$base/productos" -Headers $h
$stock8apre = [int]($productos8apre.items | Where-Object { $_.id -eq $prodVendible.id }).stockActual

$body8a = "{ ""lineas"": [{ ""productoId"": $($prodVendible.id), ""cantidad"": $cant8a }], ""pagos"": [{ ""tipoCuentaId"": $tcEfectivo, ""monto"": $total8a }] }"
$vd8a = Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h `
  -ContentType "application/json" -Body $body8a

$saldo8a = [double]$vd8a.saldoPendiente
$estado8a = $vd8a.estado
$productos8apost = Invoke-RestMethod -Uri "$base/productos" -Headers $h
$stock8apost = [int]($productos8apost.items | Where-Object { $_.id -eq $prodVendible.id }).stockActual
$stockEsperado8a = $stock8apre - $cant8a

$deudores8a = Invoke-RestMethod -Uri "$base/cobros/deudores" -Headers $h
$cobroEnDeudores8a = @($deudores8a) | Where-Object { $_.cobros -ne $null } |
  ForEach-Object { $_.cobros } | Where-Object { $_.id -eq $vd8a.id }
$cntDeudores8a = @($cobroEnDeudores8a).Count

if ($saldo8a -eq 0 -and $estado8a -eq 'COMPLETO' -and $stock8apost -eq $stockEsperado8a -and $cntDeudores8a -eq 0) {
  Write-Output "8a VD CONTADO SIN PACIENTE: OK (saldo=$saldo8a estado=$estado8a stock=$stock8apost cntDeudores=$cntDeudores8a)"
} else {
  Write-Output "8a VD CONTADO SIN PACIENTE: FALLO (saldo=$saldo8a esperado 0; estado=$estado8a esperado COMPLETO; stock=$stock8apost esperado=$stockEsperado8a; cntDeudores=$cntDeudores8a esperado 0)"
}

# ====================================================================
# ESCENARIO 8b: Saldo pendiente y sin paciente -> 400
#               POST /cobros/venta-directa sin pagos y sin pacienteId
# ====================================================================
Esperar-Error {
  $body8b = "{ ""lineas"": [{ ""productoId"": $($prodVendible.id), ""cantidad"": 1 }] }"
  Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h `
    -ContentType "application/json" -Body $body8b
} 400 "8b VD SIN PACIENTE SIN PAGO (saldo queda)"

# ====================================================================
# ESCENARIO 8c: Sobrepago -> 400
#               pagos cuyo total supera el total de la venta
# ====================================================================
$total8c = $precioVenta * 1  # 50; pagamos 999
Esperar-Error {
  $body8c = "{ ""lineas"": [{ ""productoId"": $($prodVendible.id), ""cantidad"": 1 }], ""pagos"": [{ ""tipoCuentaId"": $tcEfectivo, ""monto"": 999 }] }"
  Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h `
    -ContentType "application/json" -Body $body8c
} 400 "8c SOBREPAGO"

# ====================================================================
# ESCENARIO 9: Stock negativo — vender mas unidades que el stock disponible
#              Assert: 201/200 (no bloquea) y la respuesta contiene advertencias
# ====================================================================
$productos9 = Invoke-RestMethod -Uri "$base/productos" -Headers $h
$stock9 = [int]($productos9.items | Where-Object { $_.id -eq $prodVendible.id }).stockActual
$cantExceso = $stock9 + 5  # mas que el stock disponible; siempre excede
$total9 = $precioVenta * $cantExceso

$body9 = "{ ""lineas"": [{ ""productoId"": $($prodVendible.id), ""cantidad"": $cantExceso }], ""pagos"": [{ ""tipoCuentaId"": $tcEfectivo, ""monto"": $total9 }] }"
$vd9 = Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h `
  -ContentType "application/json" -Body $body9

$adv9 = @($vd9.advertencias)
$tieneAdv = $adv9.Count -gt 0
$estado9 = $vd9.estado
if ($estado9 -eq 'COMPLETO' -and $tieneAdv) {
  Write-Output "9 STOCK NEGATIVO (no bloquea): OK (estado=$estado9 advertencias=$($adv9.Count) '$($adv9[0])')"
} else {
  Write-Output "9 STOCK NEGATIVO (no bloquea): FALLO (estado=$estado9 esperado COMPLETO; advertencias=$($adv9.Count) esperado >=1)"
}

Write-Output "GATE productos: FIN"
