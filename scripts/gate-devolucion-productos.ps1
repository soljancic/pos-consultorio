# Gate devolucion de productos: reporte detalle + deshacer venta de item
# (stock vuelve, reversa de plata, idempotencia, sin-stock, cita->COBRADO).
# API en :3000. PS 5.1: array de 1 elem -> JSON manual.
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "devol$ts@test.com"

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

# ---- Setup ----
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" `
  -Body (@{ consultorioNombre = "DevolGate $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" `
  -Body (@{ vendeProductos = $true } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$tiposCuenta = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h
$tcEfectivo = ($tiposCuenta | Where-Object { $_.esEfectivo })[0].id

Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null

# Productos: uno con control de stock, uno sin
$prod = Invoke-RestMethod -Uri "$base/productos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Crema $ts"; precioVenta = 50; precioCosto = 20; stockActual = 10; controlaStock = $true; habilitadoVenta = $true } | ConvertTo-Json)
$prodSinStock = Invoke-RestMethod -Uri "$base/productos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Servicio extra $ts"; precioVenta = 40; precioCosto = 0; controlaStock = $false; habilitadoVenta = $true } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Pac"; apellido = "Devol $ts" } | ConvertTo-Json)

# ====================================================================
# S1: Venta directa con deuda -> devolver linea -> stock vuelve, deuda baja
# ====================================================================
$body1 = "{ ""pacienteId"": $($pac.id), ""lineas"": [{ ""productoId"": $($prod.id), ""cantidad"": 3 }] }"
$vd1 = Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h -ContentType "application/json" -Body $body1
$detId1 = ($vd1.detalles | Where-Object { $_.productoId -eq $prod.id })[0].id

$ventas1 = Invoke-RestMethod -Uri "$base/cobros/ventas-detalle" -Headers $h
$enReporte = @($ventas1.items | Where-Object { $_.detalleId -eq $detId1 }).Count

$dev1 = Invoke-RestMethod -Uri "$base/cobros/detalle/$detId1/devolver" -Method Post -Headers $h
$prodPost1 = (Invoke-RestMethod -Uri "$base/productos" -Headers $h).items | Where-Object { $_.id -eq $prod.id }
$saldo1 = [double]$dev1.saldoPendiente

if ($enReporte -ge 1 -and $prodPost1.stockActual -eq 10 -and $saldo1 -eq 0) {
  Write-Output "S1 DEVOLVER DEUDA: OK (reporte=$enReporte stock=$($prodPost1.stockActual) saldo=$saldo1)"
} else {
  Write-Output "S1 DEVOLVER DEUDA: FALLO (reporte=$enReporte stock=$($prodPost1.stockActual) esperado 10; saldo=$saldo1 esperado 0)"
}

# ====================================================================
# S2: Idempotencia -> segundo devolver de la misma linea = 400
# ====================================================================
Esperar-Error { Invoke-RestMethod -Uri "$base/cobros/detalle/$detId1/devolver" -Method Post -Headers $h } 400 "S2 IDEMPOTENCIA"

# ====================================================================
# S3: Venta directa al contado (pagada) -> devolver -> reembolso (pago negativo)
#     + stock vuelve + invariante SUM(pagos)==total-saldo
# ====================================================================
$body3 = "{ ""lineas"": [{ ""productoId"": $($prod.id), ""cantidad"": 2 }], ""pagos"": [{ ""tipoCuentaId"": $tcEfectivo, ""monto"": 100 }] }"
$vd3 = Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h -ContentType "application/json" -Body $body3
$detId3 = ($vd3.detalles | Where-Object { $_.productoId -eq $prod.id })[0].id
$stockPre3 = ((Invoke-RestMethod -Uri "$base/productos" -Headers $h).items | Where-Object { $_.id -eq $prod.id }).stockActual

Invoke-RestMethod -Uri "$base/cobros/detalle/$detId3/devolver" -Method Post -Headers $h | Out-Null
$vd3post = Invoke-RestMethod -Uri "$base/cobros/$($vd3.id)" -Headers $h
$negativo = @($vd3post.pagos | Where-Object { [double]$_.monto -lt 0 }).Count
$sumaPagos = [double](($vd3post.pagos | Measure-Object -Property monto -Sum).Sum)
$invariante = [math]::Round($sumaPagos, 2) -eq [math]::Round([double]$vd3post.total - [double]$vd3post.saldoPendiente, 2)
$stockPost3 = ((Invoke-RestMethod -Uri "$base/productos" -Headers $h).items | Where-Object { $_.id -eq $prod.id }).stockActual

if ($negativo -ge 1 -and $invariante -and $stockPost3 -eq ($stockPre3 + 2)) {
  Write-Output "S3 DEVOLVER PAGADO (reembolso): OK (pagoNeg=$negativo invariante=$invariante stock $stockPre3->$stockPost3)"
} else {
  Write-Output "S3 DEVOLVER PAGADO (reembolso): FALLO (pagoNeg=$negativo invariante=$invariante stock $stockPre3->$stockPost3 esperado +2)"
}

# ====================================================================
# S4: Producto sin control de stock -> devolver no toca stock, revierte plata
# ====================================================================
$body4 = "{ ""lineas"": [{ ""productoId"": $($prodSinStock.id), ""cantidad"": 1 }], ""pagos"": [{ ""tipoCuentaId"": $tcEfectivo, ""monto"": 40 }] }"
$vd4 = Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h -ContentType "application/json" -Body $body4
$detId4 = ($vd4.detalles | Where-Object { $_.productoId -eq $prodSinStock.id })[0].id
$dev4 = Invoke-RestMethod -Uri "$base/cobros/detalle/$detId4/devolver" -Method Post -Headers $h
$prodSinStockPost = (Invoke-RestMethod -Uri "$base/productos" -Headers $h).items | Where-Object { $_.id -eq $prodSinStock.id }
$totalNuevo4 = [double]$dev4.total

if (($null -eq $prodSinStockPost.stockActual -or $prodSinStockPost.controlaStock -eq $false) -and $totalNuevo4 -eq 0) {
  Write-Output "S4 SIN CONTROL STOCK: OK (controlaStock=$($prodSinStockPost.controlaStock) totalNuevo=$totalNuevo4)"
} else {
  Write-Output "S4 SIN CONTROL STOCK: FALLO (controlaStock=$($prodSinStockPost.controlaStock) totalNuevo=$totalNuevo4 esperado 0)"
}

# ====================================================================
# S5: Cita confirmada CON_DEUDA -> devolver el producto la salda -> COBRADO
#     servicio 200 + 1 producto 50 = 250; pago 200 deja saldo 50 (CON_DEUDA);
#     devolver el producto (50) -> saldo 0 -> cita COBRADO
# ====================================================================
$svc = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Consulta $ts"; duracionMin = 30; precioBase = 200 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Dr Devol $ts" } | ConvertTo-Json)
$manana = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$cita5 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = "${manana}T09:00:00Z" } | ConvertTo-Json)
foreach ($e in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita5.id)/estado" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$cobro5 = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita5.id)" -Headers $h
$lineas5 = "{ ""lineas"": [{ ""productoId"": $($prod.id), ""cantidad"": 1 }] }"
Invoke-RestMethod -Uri "$base/cobros/$($cobro5.id)/lineas" -Method Put -Headers $h -ContentType "application/json" -Body $lineas5 | Out-Null
# pago parcial 200 -> CON_DEUDA (saldo 50)
Invoke-RestMethod -Uri "$base/cobros/$($cobro5.id)/pagos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ monto = 200; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
$cobro5b = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita5.id)" -Headers $h
$detId5 = ($cobro5b.detalles | Where-Object { $_.productoId -eq $prod.id })[0].id

Invoke-RestMethod -Uri "$base/cobros/detalle/$detId5/devolver" -Method Post -Headers $h | Out-Null
$cita5post = Invoke-RestMethod -Uri "$base/citas/$($cita5.id)" -Headers $h
$cobro5post = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita5.id)" -Headers $h

if ($cita5post.estado -eq 'COBRADO' -and [double]$cobro5post.saldoPendiente -eq 0) {
  Write-Output "S5 CITA CON_DEUDA->COBRADO: OK (cita=$($cita5post.estado) saldo=$($cobro5post.saldoPendiente))"
} else {
  Write-Output "S5 CITA CON_DEUDA->COBRADO: FALLO (cita=$($cita5post.estado) esperado COBRADO; saldo=$($cobro5post.saldoPendiente) esperado 0)"
}

# ====================================================================
# S6: Rechazo en cita ATENDIDA (venta no confirmada) -> 400
# ====================================================================
Esperar-Error {
  $cita6 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
    -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = "${manana}T10:00:00Z" } | ConvertTo-Json)
  foreach ($e in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA")) {
    Invoke-RestMethod -Uri "$base/citas/$($cita6.id)/estado" -Method Put -Headers $h -ContentType "application/json" `
      -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
  }
  $cobro6 = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita6.id)" -Headers $h
  $lineas6 = "{ ""lineas"": [{ ""productoId"": $($prod.id), ""cantidad"": 1 }] }"
  $cobro6b = Invoke-RestMethod -Uri "$base/cobros/$($cobro6.id)/lineas" -Method Put -Headers $h -ContentType "application/json" -Body $lineas6
  $detId6 = ($cobro6b.detalles | Where-Object { $_.productoId -eq $prod.id })[0].id
  Invoke-RestMethod -Uri "$base/cobros/detalle/$detId6/devolver" -Method Post -Headers $h
} 400 "S6 RECHAZO CITA ATENDIDA"

Write-Output "GATE devolucion-productos: FIN"
