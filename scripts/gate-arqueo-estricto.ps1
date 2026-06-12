# Gate arqueo ciego ESTRICTO: efectivo oculto a no-ADMIN con turno abierto (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "ae$ts@test.com"

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "AE $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 100 } | ConvertTo-Json) | Out-Null

# Cobro en efectivo para que haya monto que ocultar
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 500 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. AE" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Ana"; apellido = "Arqueo" } | ConvertTo-Json)
$fh = (Get-Date -Hour 9 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
foreach ($estado in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $estado } | ConvertTo-Json) | Out-Null
}
$cobro = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h
Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 500; formaPago = "EFECTIVO" } | ConvertTo-Json) | Out-Null

$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }

# 1) Turno abierto: SECRETARIA no ve efectivo/inicial/total; ADMIN si
$hoySec = Invoke-RestMethod -Uri "$base/caja/hoy" -Headers $hSec
$hoyAdm = Invoke-RestMethod -Uri "$base/caja/hoy" -Headers $h
Write-Output "1 ABIERTA SEC: efectivo=$($null -eq $hoySec.caja.totalEfectivo) inicial=$($null -eq $hoySec.caja.montoInicial) total=$($null -eq $hoySec.caja.totalGeneral) (esp True True True)"
Write-Output "2 ABIERTA ADM: efectivo=$($hoyAdm.caja.totalEfectivo) inicial=$($hoyAdm.caja.montoInicial) (esp 500 100)"
Write-Output "3 OPERACION VISIBLE: pagos=$(@($hoySec.pagos).Count) (esp 1) qr=$($hoySec.caja.totalQr) (esp 0)"

# 4) La SECRETARIA cierra ciego igual (declara) y tras el cierre ya ve todo
Invoke-RestMethod -Uri "$base/caja/cerrar" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ montoDeclarado = 600 } | ConvertTo-Json) | Out-Null
$hoySec2 = Invoke-RestMethod -Uri "$base/caja/hoy" -Headers $hSec
Write-Output "4 CERRADA SEC: efectivo=$($hoySec2.caja.totalEfectivo) (esp 500) diferencia=$($hoySec2.caja.diferencia) (esp 0)"
