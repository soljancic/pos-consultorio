$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "m2$ts@test.com"
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "M2 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$token = $login.accessToken; if (-not $token) { $token = $login.access_token }
$h = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null # E2-M9: turno abierto
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 5000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. G" } | ConvertTo-Json)

# Paciente A: cita hoy, atendida, pago parcial -> ES deudor
$pacA = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Ana"; apellido = "Deudora"; telefono = "+549115555" } | ConvertTo-Json)
$fhA = (Get-Date -Hour 9 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$citaA = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pacA.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fhA } | ConvertTo-Json)
foreach ($e in @('CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA')) {
  Invoke-RestMethod -Uri "$base/citas/$($citaA.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$cobroA = Invoke-RestMethod -Uri "$base/cobros/cita/$($citaA.id)" -Headers $h
Invoke-RestMethod -Uri "$base/cobros/$($cobroA.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 2000; formaPago = "EFECTIVO" } | ConvertTo-Json) | Out-Null

# Paciente B: cita FUTURA (manana) -> NO debe ser deudor
$pacB = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Beto"; apellido = "Futuro" } | ConvertTo-Json)
$fhB = (Get-Date).AddDays(1).Date.AddHours(10).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pacB.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fhB } | ConvertTo-Json) | Out-Null

# Verificaciones
$deudores = @(Invoke-RestMethod -Uri "$base/cobros/deudores" -Headers $h)
$resumen = Invoke-RestMethod -Uri "$base/cobros/deudores/resumen" -Headers $h
Write-Output "DEUDORES: $($deudores.Count) (esperado 1)"
Write-Output "  primero: $($deudores[0].apellido) deuda=$($deudores[0].deudaTotal) tieneUltimoPago=$($null -ne $deudores[0].ultimoPago) servicio=$($deudores[0].ultimoServicio)"
$tieneB = @($deudores | Where-Object { $_.apellido -eq 'Futuro' }).Count
Write-Output "  paciente con cita futura en lista: $tieneB (esperado 0)"
Write-Output "RESUMEN: total=$($resumen.totalDeuda) (esperado 3000) pacientes=$($resumen.cantidadPacientes) (esperado 1)"

# Pagar saldo desde el cobro del deudor -> desaparece
$cobroId = $deudores[0].cobros[0].id
Invoke-RestMethod -Uri "$base/cobros/$cobroId/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 3000; formaPago = "QR" } | ConvertTo-Json) | Out-Null
# Gotcha PS 5.1: envolver el cmdlet directo en @() cuenta 1 con '[]' (el array
# vacio entra al pipeline como UN objeto). Asignar primero y recien envolver.
$deudores2Raw = ConvertFrom-Json -InputObject (Invoke-WebRequest -Uri "$base/cobros/deudores" -Headers $h -UseBasicParsing).Content
$deudores2 = @($deudores2Raw)
$resumen2 = Invoke-RestMethod -Uri "$base/cobros/deudores/resumen" -Headers $h
Write-Output "TRAS PAGO TOTAL: deudores=$($deudores2.Count) (esperado 0) resumen total=$($resumen2.totalDeuda) (esperado 0)"
