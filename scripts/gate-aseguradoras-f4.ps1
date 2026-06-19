# Gate Aseguradoras F4: reportes aseguradoras + cobertura (API en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "asegf4$ts@test.com"
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
  -Body (@{ consultorioNombre = "ASEGF4 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# Habilitar aseguradoras en el consultorio
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" `
  -Body (@{ trabajaConAseguradoras = $true } | ConvertTo-Json) | Out-Null

# Doctor
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Dr F4 $ts" } | ConvertTo-Json)

# Servicio (precioBase = 200)
$svc = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Consulta F4 $ts"; duracionMin = 30; precioBase = 200 } | ConvertTo-Json)

# Aseguradora + categoria
$aseg = Invoke-RestMethod -Uri "$base/aseguradoras" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "BISA F4 $ts" } | ConvertTo-Json)
$cat = Invoke-RestMethod -Uri "$base/categorias-seguro" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ aseguradoraId = $aseg.id; nombre = "Cat F4 $ts"; porcentajeCobertura = 84 } | ConvertTo-Json)

# Tarifa: montoAseguradora=168
$tarifasBody = @{
  categoriaSeguroId = $cat.id
  tarifas = @(@{ servicioId = $svc.id; montoPaciente = 0; montoAseguradora = 168 })
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$base/tarifas-cobertura" -Method Put -Headers $h -ContentType "application/json" `
  -Body $tarifasBody | Out-Null

# Paciente con seguro
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Ana"; apellido = "F4 $ts"; tieneSeguro = $true; aseguradoraId = $aseg.id; categoriaSeguroId = $cat.id } | ConvertTo-Json)

# Cita hoy con usaSeguro=true → genera LiquidacionItem PENDIENTE
$fechaHora = (Get-Date).Date.AddHours(9).ToString("yyyy-MM-ddTHH:mm:ss")
$citaBody = @{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = $fechaHora; usaSeguro = $true } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body $citaBody | Out-Null

# ====================================================================
# CASO 1: GET /reportes/aseguradoras?desde=hoy&hasta=hoy → 1 row, atenciones=1, pacientes=1, montoTotal=168, pendiente=168
# ====================================================================
$rep1 = Invoke-RestMethod -Uri "$base/reportes/aseguradoras?desde=$hoy&hasta=$hoy" -Headers $h
$rows1 = @($rep1.rows)
$row1 = $rows1[0]
$kpiTotal = $rep1.kpis | Where-Object { $_.key -eq 'monto_total' }
Write-Output "1 ASEG INICIAL: rows.Count=$($rows1.Count) (esp 1) aseguradora=$($row1.aseguradora) atenciones=$($row1.atenciones) (esp 1) pacientes=$($row1.pacientes) (esp 1) montoTotal=$($row1.montoTotal) (esp 168) pendiente=$($row1.pendiente) (esp 168) kpi.monto_total=$($kpiTotal.value) (esp 168)"

# Obtener id de la liquidacion para los PATCH
$liq = Invoke-RestMethod -Uri "$base/liquidaciones" -Headers $h
$liqId = @($liq.rows)[0].id

# ====================================================================
# CASO 2: PATCH FACTURADO luego PAGADO; re-GET /reportes/aseguradoras → pagado=168, pendiente=0
# ====================================================================
Invoke-RestMethod -Uri "$base/liquidaciones/$liqId/estado" -Method Patch -Headers $h -ContentType "application/json" `
  -Body (@{ estado = "FACTURADO" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/liquidaciones/$liqId/estado" -Method Patch -Headers $h -ContentType "application/json" `
  -Body (@{ estado = "PAGADO" } | ConvertTo-Json) | Out-Null
$rep2 = Invoke-RestMethod -Uri "$base/reportes/aseguradoras?desde=$hoy&hasta=$hoy" -Headers $h
$row2 = @($rep2.rows)[0]
Write-Output "2 ASEG PAGADO: pagado=$($row2.pagado) (esp 168) pendiente=$($row2.pendiente) (esp 0)"

# ====================================================================
# CASO 3: GET /reportes/cobertura → con_seguro=1; rows con la aseguradora (pacientes=1); meta.porCategoria>=1
# ====================================================================
$cob = Invoke-RestMethod -Uri "$base/reportes/cobertura" -Headers $h
$kpiConSeguro = $cob.kpis | Where-Object { $_.key -eq 'con_seguro' }
$cobRows = @($cob.rows)
$cobRowAseg = $cobRows | Where-Object { $_.aseguradoraId -eq $aseg.id }
$porCat = @($cob.meta.porCategoria)
Write-Output "3 COBERTURA BASE: con_seguro=$($kpiConSeguro.value) (esp 1) rows.Count=$($cobRows.Count) (esp >=1) aseg.pacientes=$($cobRowAseg.pacientes) (esp 1) meta.porCategoria.Count=$($porCat.Count) (esp >=1)"

# ====================================================================
# CASO 4: Crear paciente SIN seguro → GET /reportes/cobertura → sin_seguro>=1
# ====================================================================
Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Sin"; apellido = "Seguro $ts"; tieneSeguro = $false } | ConvertTo-Json) | Out-Null
$cob2 = Invoke-RestMethod -Uri "$base/reportes/cobertura" -Headers $h
$kpiSinSeguro = $cob2.kpis | Where-Object { $_.key -eq 'sin_seguro' }
Write-Output "4 COBERTURA SIN SEGURO: sin_seguro=$($kpiSinSeguro.value) (esp >=1)"

# ====================================================================
# CASO 5: GET /reportes/aseguradoras?export=1 → rows sin paginar (Count>=1)
# ====================================================================
$repExp = Invoke-RestMethod -Uri "$base/reportes/aseguradoras?desde=$hoy&hasta=$hoy&export=1" -Headers $h
$rowsExp = @($repExp.rows)
Write-Output "5 EXPORT: rows.Count=$($rowsExp.Count) (esp >=1)"

# ====================================================================
# CASO 6: Rol SECRETARIA → GET /reportes/aseguradoras 403 y GET /reportes/cobertura 403
# ====================================================================
$emailSec = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Sec F4"; email = $emailSec; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $emailSec; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }

Esperar-Error {
  Invoke-RestMethod -Uri "$base/reportes/aseguradoras?desde=$hoy&hasta=$hoy" -Headers $hSec
} 403 "6a SECRETARIA GET /reportes/aseguradoras"

Esperar-Error {
  Invoke-RestMethod -Uri "$base/reportes/cobertura" -Headers $hSec
} 403 "6b SECRETARIA GET /reportes/cobertura"
