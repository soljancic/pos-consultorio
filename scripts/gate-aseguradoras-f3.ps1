# Gate Aseguradoras F3: liquidaciones list + transiciones de estado (API en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "asegf3$ts@test.com"
$hoy = Get-Date -Format "yyyy-MM-dd"

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

# --- Setup: tenant fresco ---
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" `
  -Body (@{ consultorioNombre = "ASEGF3 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# Habilitar aseguradoras en el consultorio
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" `
  -Body (@{ trabajaConAseguradoras = $true } | ConvertTo-Json) | Out-Null

# Doctor
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Dr F3 $ts" } | ConvertTo-Json)

# Servicio (precioBase = 200)
$svc = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Consulta F3 $ts"; duracionMin = 30; precioBase = 200 } | ConvertTo-Json)

# Aseguradora + categoria
$aseg = Invoke-RestMethod -Uri "$base/aseguradoras" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "BISA F3 $ts" } | ConvertTo-Json)
$cat = Invoke-RestMethod -Uri "$base/categorias-seguro" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ aseguradoraId = $aseg.id; nombre = "Cat F3 $ts"; porcentajeCobertura = 84 } | ConvertTo-Json)

# Tarifa: montoAseguradora=168
$tarifasBody = @{
  categoriaSeguroId = $cat.id
  tarifas = @(@{ servicioId = $svc.id; montoPaciente = 0; montoAseguradora = 168 })
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$base/tarifas-cobertura" -Method Put -Headers $h -ContentType "application/json" `
  -Body $tarifasBody | Out-Null

# Paciente con seguro
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Ana"; apellido = "F3 $ts"; tieneSeguro = $true; aseguradoraId = $aseg.id; categoriaSeguroId = $cat.id } | ConvertTo-Json)

# Cita con usaSeguro=true → genera LiquidacionItem PENDIENTE
$fechaHora = [datetime]::Today.AddDays(1).AddHours(9).ToString("yyyy-MM-ddTHH:mm:ss")
$citaBody = @{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = $fechaHora; usaSeguro = $true } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body $citaBody | Out-Null

# ====================================================================
# CASO 1: GET /liquidaciones → 1 row, estado PENDIENTE, montoAseguradora=168, totales.pendiente=168
# ====================================================================
$liq = Invoke-RestMethod -Uri "$base/liquidaciones" -Headers $h
$rows = @($liq.rows)
$row0 = $rows[0]
Write-Output "1 LIST PENDIENTE: total=$($liq.total) (esp 1) estado=$($row0.estado) (esp PENDIENTE) montoAseguradora=$($row0.montoAseguradora) (esp 168) totales.pendiente=$($liq.totales.pendiente) (esp 168)"

# Guardar id para los PATCH siguientes
$id = $row0.id

# ====================================================================
# CASO 2: GET /liquidaciones?estado=PAGADO → 0 rows
# ====================================================================
$liqPagado = Invoke-RestMethod -Uri "$base/liquidaciones?estado=PAGADO" -Headers $h
$rowsPagado = @($liqPagado.rows)
Write-Output "2 FILTRO PAGADO VACIO: count=$($rowsPagado.Count) (esp 0)"

# ====================================================================
# CASO 3: PATCH .../estado { estado=PAGADO } desde PENDIENTE → 400 (transicion invalida)
# ====================================================================
Esperar-Error {
  Invoke-RestMethod -Uri "$base/liquidaciones/$id/estado" -Method Patch -Headers $h -ContentType "application/json" `
    -Body (@{ estado = "PAGADO" } | ConvertTo-Json)
} 400 "3 PENDIENTE->PAGADO INVALIDO"

# ====================================================================
# CASO 4: PATCH .../estado { estado=RECHAZADO } SIN motivo → 400 (ValidateIf)
# ====================================================================
Esperar-Error {
  Invoke-RestMethod -Uri "$base/liquidaciones/$id/estado" -Method Patch -Headers $h -ContentType "application/json" `
    -Body (@{ estado = "RECHAZADO" } | ConvertTo-Json)
} 400 "4 RECHAZADO SIN MOTIVO"

# ====================================================================
# CASO 5: PATCH .../estado { estado=FACTURADO } → OK; re-GET → FACTURADO, totales correctos
# ====================================================================
Invoke-RestMethod -Uri "$base/liquidaciones/$id/estado" -Method Patch -Headers $h -ContentType "application/json" `
  -Body (@{ estado = "FACTURADO" } | ConvertTo-Json) | Out-Null
$liqF = Invoke-RestMethod -Uri "$base/liquidaciones" -Headers $h
$rowF = @($liqF.rows)[0]
Write-Output "5 PENDIENTE->FACTURADO: estado=$($rowF.estado) (esp FACTURADO) totales.facturado=$($liqF.totales.facturado) (esp 168) totales.pendiente=$($liqF.totales.pendiente) (esp 0)"

# ====================================================================
# CASO 6: PATCH .../estado { estado=PAGADO } → OK; GET ?estado=PAGADO → 1 row
# ====================================================================
Invoke-RestMethod -Uri "$base/liquidaciones/$id/estado" -Method Patch -Headers $h -ContentType "application/json" `
  -Body (@{ estado = "PAGADO" } | ConvertTo-Json) | Out-Null
$liqPag2 = Invoke-RestMethod -Uri "$base/liquidaciones?estado=PAGADO" -Headers $h
$rowsPag2 = @($liqPag2.rows)
Write-Output "6 FACTURADO->PAGADO: count=$($rowsPag2.Count) (esp 1) estado=$($rowsPag2[0].estado) (esp PAGADO)"

# ====================================================================
# CASO 7: GET /liquidaciones?export=1 → rows sin paginar, page/pageSize reflejan todos
# ====================================================================
$liqExp = Invoke-RestMethod -Uri "$base/liquidaciones?export=1" -Headers $h
$rowsExp = @($liqExp.rows)
Write-Output "7 EXPORT: rows.Count=$($rowsExp.Count) (esp 1) total=$($liqExp.total) (esp 1) page=$($liqExp.page) (esp 1) pageSize=$($liqExp.pageSize) (esp 1)"

# ====================================================================
# CASO 8: Rol SECRETARIA → GET /liquidaciones 403 y PATCH .../estado 403
# ====================================================================
$emailSec = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Sec F3"; email = $emailSec; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $emailSec; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }

Esperar-Error {
  Invoke-RestMethod -Uri "$base/liquidaciones" -Headers $hSec
} 403 "8a SECRETARIA GET /liquidaciones"

Esperar-Error {
  Invoke-RestMethod -Uri "$base/liquidaciones/$id/estado" -Method Patch -Headers $hSec -ContentType "application/json" `
    -Body (@{ estado = "PENDIENTE" } | ConvertTo-Json)
} 403 "8b SECRETARIA PATCH /liquidaciones/:id/estado"
