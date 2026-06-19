# Gate Aseguradoras F2: cobertura en cita + snapshot seguro (API en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "asegf2$ts@test.com"
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
  -Body (@{ consultorioNombre = "ASEGF2 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# Habilitar aseguradoras en el consultorio
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" `
  -Body (@{ trabajaConAseguradoras = $true } | ConvertTo-Json) | Out-Null

# Abrir caja (sin turno abierto no se puede cobrar; create crea cobro)
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null

# Doctor
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Dr Seguro $ts" } | ConvertTo-Json)

# Servicio CON tarifa (precioBase = 200)
$svc = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Consulta $ts"; duracionMin = 30; precioBase = 200 } | ConvertTo-Json)

# Servicio SIN tarifa (precioBase = 150)
$svcSinTarifa = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "RX $ts"; duracionMin = 20; precioBase = 150 } | ConvertTo-Json)

# Aseguradora + categoria
$aseg = Invoke-RestMethod -Uri "$base/aseguradoras" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "BISA F2 $ts" } | ConvertTo-Json)
$cat = Invoke-RestMethod -Uri "$base/categorias-seguro" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ aseguradoraId = $aseg.id; nombre = "Cat80 $ts"; porcentajeCobertura = 80 } | ConvertTo-Json)

# Tarifa: montoPaciente=0, montoAseguradora=168 (solo para $svc; $svcSinTarifa no tiene)
$tarifasBody = @{
  categoriaSeguroId = $cat.id
  tarifas = @(@{ servicioId = $svc.id; montoPaciente = 0; montoAseguradora = 168 })
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$base/tarifas-cobertura" -Method Put -Headers $h -ContentType "application/json" `
  -Body $tarifasBody | Out-Null

# Paciente CON seguro
$pacConSeguro = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Ana"; apellido = "Seguro $ts"; tieneSeguro = $true; aseguradoraId = $aseg.id; categoriaSeguroId = $cat.id } | ConvertTo-Json)

# Paciente SIN seguro
$pacSinSeguro = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Pedro"; apellido = "Particular $ts" } | ConvertTo-Json)

# Horas de cita (evitar solapamiento: cada cita en un intervalo diferente)
$base_dt = [datetime]::Today.AddDays(1).AddHours(9)
$dt1 = $base_dt.ToString("yyyy-MM-ddTHH:mm:ss")                    # 09:00
$dt2 = $base_dt.AddMinutes(60).ToString("yyyy-MM-ddTHH:mm:ss")     # 10:00
$dt3 = $base_dt.AddMinutes(120).ToString("yyyy-MM-ddTHH:mm:ss")    # 11:00
$dt4 = $base_dt.AddMinutes(180).ToString("yyyy-MM-ddTHH:mm:ss")    # 12:00
$dt6 = $base_dt.AddMinutes(240).ToString("yyyy-MM-ddTHH:mm:ss")    # 13:00

# ====================================================================
# CASO 1: usaSeguro=true, paciente con seguro, servicio con tarifa
#         → cobro total=0 (montoPaciente), snapshot usaSeguro=true
# ====================================================================
$cita1 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pacConSeguro.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = $dt1; usaSeguro = $true } | ConvertTo-Json)
$det1 = Invoke-RestMethod -Uri "$base/citas/$($cita1.id)" -Headers $h
Write-Output "1 CITA CON SEGURO: usaSeguro=$($det1.usaSeguro) (esp True) montoPaciente=$($det1.montoPaciente) (esp 0) montoAseguradora=$($det1.montoAseguradora) (esp 168) cobroTotal=$($det1.cobro.total) (esp 0)"

# ====================================================================
# CASO 2: mismo paciente con seguro pero usaSeguro=false
#         → cita particular, cobro total=200, usaSeguro=false
# ====================================================================
$cita2 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pacConSeguro.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = $dt2; usaSeguro = $false } | ConvertTo-Json)
$det2 = Invoke-RestMethod -Uri "$base/citas/$($cita2.id)" -Headers $h
Write-Output "2 CITA PARTICULAR (paciente c/seguro): usaSeguro=$($det2.usaSeguro) (esp False) cobroTotal=$($det2.cobro.total) (esp 200)"

# ====================================================================
# CASO 3: paciente SIN seguro + usaSeguro=true → fallback particular
#         cobro total=200, usaSeguro=false
# ====================================================================
$cita3 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pacSinSeguro.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = $dt3; usaSeguro = $true } | ConvertTo-Json)
$det3 = Invoke-RestMethod -Uri "$base/citas/$($cita3.id)" -Headers $h
Write-Output "3 FALLBACK SIN SEGURO: usaSeguro=$($det3.usaSeguro) (esp False) cobroTotal=$($det3.cobro.total) (esp 200)"

# ====================================================================
# CASO 4: paciente CON seguro + usaSeguro=true + servicio SIN tarifa
#         → fallback particular, cobro=150, usaSeguro=false
# ====================================================================
$cita4 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pacConSeguro.id; doctorId = $doc.id; servicioId = $svcSinTarifa.id; fechaHora = $dt4; usaSeguro = $true } | ConvertTo-Json)
$det4 = Invoke-RestMethod -Uri "$base/citas/$($cita4.id)" -Headers $h
Write-Output "4 FALLBACK SIN TARIFA: usaSeguro=$($det4.usaSeguro) (esp False) cobroTotal=$($det4.cobro.total) (esp 150)"

# ====================================================================
# CASO 5: POST /pacientes { tieneSeguro=true } sin aseguradoraId → 400
# ====================================================================
Esperar-Error {
  Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
    -Body (@{ nombre = "X"; apellido = "Y"; tieneSeguro = $true } | ConvertTo-Json)
} 400 "5 PACIENTE SIN ASEGURADORA (tieneSeguro=true)"

# ====================================================================
# CASO 6: reprogramar cita1 (con seguro, svc con tarifa) al servicio
#         sin tarifa → revierte a particular (usaSeguro=false, total=150)
# ====================================================================
$reprogBody = @{ fechaHora = $dt6; doctorId = $doc.id; servicioId = $svcSinTarifa.id } | ConvertTo-Json
Invoke-RestMethod -Uri "$base/citas/$($cita1.id)" -Method Put -Headers $h -ContentType "application/json" `
  -Body $reprogBody | Out-Null
$det6 = Invoke-RestMethod -Uri "$base/citas/$($cita1.id)" -Headers $h
Write-Output "6 REPROGRAMAR A SVC SIN TARIFA: usaSeguro=$($det6.usaSeguro) (esp False) cobroTotal=$($det6.cobro.total) (esp 150)"
