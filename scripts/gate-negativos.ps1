$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"

function New-Consultorio($nombre) {
  $email = "$nombre$ts@test.com"
  Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "$nombre $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
  $login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
  $token = $login.accessToken; if (-not $token) { $token = $login.access_token }
  return @{ Authorization = "Bearer $token" }
}

$hA = New-Consultorio "TenantA"
$hB = New-Consultorio "TenantB"

# Setup en A
$srvA = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $hA -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 5000 } | ConvertTo-Json)
$docA = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $hA -ContentType "application/json" -Body (@{ nombre = "Dr. A" } | ConvertTo-Json)
$pacA = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $hA -ContentType "application/json" -Body (@{ nombre = "Solo"; apellido = "DeA" } | ConvertTo-Json)
$fh = (Get-Date -Hour 15 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$citaA = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $hA -ContentType "application/json" -Body (@{ pacienteId = $pacA.id; doctorId = $docA.id; servicioId = $srvA.id; fechaHora = $fh } | ConvertTo-Json)

# === 1. AISLAMIENTO MULTI-TENANT ===
# B no ve la ficha del paciente de A
try {
  Invoke-RestMethod -Uri "$base/pacientes/$($pacA.id)" -Headers $hB -ErrorAction Stop | Out-Null
  Write-Output "TENANT FICHA: FALLO CRITICO (B leyo paciente de A)"
} catch { Write-Output "TENANT FICHA: OK ($($_.Exception.Response.StatusCode.value__) para B)" }

# B no puede editar el paciente de A
try {
  Invoke-RestMethod -Uri "$base/pacientes/$($pacA.id)" -Method Put -Headers $hB -ContentType "application/json" -Body (@{ nombre = "Hackeado" } | ConvertTo-Json) -ErrorAction Stop | Out-Null
  Write-Output "TENANT EDIT: FALLO CRITICO (B edito paciente de A)"
} catch { Write-Output "TENANT EDIT: OK ($($_.Exception.Response.StatusCode.value__) para B)" }

# B no puede cambiar el estado de la cita de A
try {
  Invoke-RestMethod -Uri "$base/citas/$($citaA.id)/estado" -Method Put -Headers $hB -ContentType "application/json" -Body (@{ estado = "CONFIRMADA" } | ConvertTo-Json) -ErrorAction Stop | Out-Null
  Write-Output "TENANT CITA: FALLO CRITICO (B cambio estado de cita de A)"
} catch { Write-Output "TENANT CITA: OK ($($_.Exception.Response.StatusCode.value__) para B)" }

# B no ve la atencion de A ni puede escribirla
try {
  Invoke-RestMethod -Uri "$base/atenciones/cita/$($citaA.id)" -Method Put -Headers $hB -ContentType "application/json" -Body (@{ diagnostico = "intrusion" } | ConvertTo-Json) -ErrorAction Stop | Out-Null
  Write-Output "TENANT ATENCION: FALLO CRITICO"
} catch { Write-Output "TENANT ATENCION: OK ($($_.Exception.Response.StatusCode.value__) para B)" }

# La agenda de B esta vacia (no ve las citas de A)
$hoy = Get-Date -Format "yyyy-MM-dd"
$citasB = (Invoke-WebRequest -Uri "$base/citas?fecha=$hoy" -Headers $hB -UseBasicParsing).Content
Write-Output "TENANT AGENDA B: '$citasB' (esp [])"

# === 2. REGLAS DE NEGOCIO ===
# Cita solapada para el mismo doctor -> 409
try {
  $fh2 = (Get-Date -Hour 15 -Minute 15 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $hA -ContentType "application/json" -Body (@{ pacienteId = $pacA.id; doctorId = $docA.id; servicioId = $srvA.id; fechaHora = $fh2 } | ConvertTo-Json) -ErrorAction Stop | Out-Null
  Write-Output "SOLAPAMIENTO: FALLO (acepto cita solapada)"
} catch { Write-Output "SOLAPAMIENTO: OK ($($_.Exception.Response.StatusCode.value__) esp 409)" }

# Transicion invalida PENDIENTE -> COBRADO -> 400
try {
  Invoke-RestMethod -Uri "$base/citas/$($citaA.id)/estado" -Method Put -Headers $hA -ContentType "application/json" -Body (@{ estado = "COBRADO" } | ConvertTo-Json) -ErrorAction Stop | Out-Null
  Write-Output "TRANSICION INVALIDA: FALLO (acepto PENDIENTE->COBRADO)"
} catch { Write-Output "TRANSICION INVALIDA: OK ($($_.Exception.Response.StatusCode.value__) esp 400)" }

# Pago que excede el saldo -> 400
foreach ($e in @('CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA')) {
  Invoke-RestMethod -Uri "$base/citas/$($citaA.id)/estado" -Method Put -Headers $hA -ContentType "application/json" -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$cobroA = Invoke-RestMethod -Uri "$base/cobros/cita/$($citaA.id)" -Headers $hA
try {
  Invoke-RestMethod -Uri "$base/cobros/$($cobroA.id)/pagos" -Method Post -Headers $hA -ContentType "application/json" -Body (@{ monto = 99999; formaPago = "EFECTIVO" } | ConvertTo-Json) -ErrorAction Stop | Out-Null
  Write-Output "PAGO EXCEDIDO: FALLO (acepto monto mayor al saldo)"
} catch { Write-Output "PAGO EXCEDIDO: OK ($($_.Exception.Response.StatusCode.value__) esp 400)" }

# Pago sobre cobro COMPLETO -> 400
Invoke-RestMethod -Uri "$base/cobros/$($cobroA.id)/pagos" -Method Post -Headers $hA -ContentType "application/json" -Body (@{ monto = 5000; formaPago = "EFECTIVO" } | ConvertTo-Json) | Out-Null
try {
  Invoke-RestMethod -Uri "$base/cobros/$($cobroA.id)/pagos" -Method Post -Headers $hA -ContentType "application/json" -Body (@{ monto = 1; formaPago = "EFECTIVO" } | ConvertTo-Json) -ErrorAction Stop | Out-Null
  Write-Output "PAGO SOBRE COMPLETO: FALLO"
} catch { Write-Output "PAGO SOBRE COMPLETO: OK ($($_.Exception.Response.StatusCode.value__) esp 400)" }

# Sin token -> 401
try {
  Invoke-RestMethod -Uri "$base/pacientes" -ErrorAction Stop | Out-Null
  Write-Output "SIN TOKEN: FALLO (respondio sin auth)"
} catch { Write-Output "SIN TOKEN: OK ($($_.Exception.Response.StatusCode.value__) esp 401)" }
