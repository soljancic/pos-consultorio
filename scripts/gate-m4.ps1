$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "m4$ts@test.com"
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "M4 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$token = $login.accessToken; if (-not $token) { $token = $login.access_token }
$h = @{ Authorization = "Bearer $token" }
$tiposCuenta = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h; $tcEfectivo = ($tiposCuenta | Where-Object { $_.esEfectivo }).id; $tcQr = ($tiposCuenta | Where-Object { $_.nombre -eq "QR" }).id
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null # E2-M9: turno abierto
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 5000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. M4" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Pedro"; apellido = "Atendido" } | ConvertTo-Json)
$fh = (Get-Date -Hour 9 -Minute 30 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)

# 1. No se puede registrar atencion en cita PENDIENTE
try {
  Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ diagnostico = "X" } | ConvertTo-Json) | Out-Null
  Write-Output "VALIDACION ESTADO: FALLO (acepto atencion en PENDIENTE)"
} catch { Write-Output "VALIDACION ESTADO: OK (rechaza atencion en cita PENDIENTE)" }

# 2. Llevar a EN_ATENCION y registrar
foreach ($e in @('CONFIRMADA','LLEGO','EN_ATENCION')) {
  Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$at = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ motivo = "Dolor"; diagnostico = "Contractura"; tratamiento = "Reposo 48h"; evolucion = "Mejora" } | ConvertTo-Json)
Write-Output "UPSERT CREATE: diag=$($at.diagnostico) trat=$($at.tratamiento)"

# 3. Editar (upsert update)
$at2 = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ motivo = "Dolor"; diagnostico = "Contractura cervical"; tratamiento = "Reposo 72h" } | ConvertTo-Json)
Write-Output "UPSERT UPDATE: diag=$($at2.diagnostico)"

# 4. GET de la atencion
$atGet = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Headers $h
Write-Output "GET ATENCION: trat=$($atGet.tratamiento)"

# 5. Marcar ATENDIDA y verificar que la ficha del paciente incluye la atencion
Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "ATENDIDA" } | ConvertTo-Json) | Out-Null
$ficha = Invoke-RestMethod -Uri "$base/pacientes/$($pac.id)" -Headers $h
$atFicha = $ficha.citas[0].atencion
Write-Output "FICHA INCLUYE ATENCION: $($null -ne $atFicha) diag=$($atFicha.diagnostico)"

# 6. Filtro por doctor en citas
$doc2 = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Otro" } | ConvertTo-Json)
$hoy = Get-Date -Format "yyyy-MM-dd"
$citasDoc1 = ConvertFrom-Json -InputObject (Invoke-WebRequest -Uri "$base/citas?fecha=$hoy&doctorId=$($doc.id)" -Headers $h -UseBasicParsing).Content
$citasDoc2 = ConvertFrom-Json -InputObject (Invoke-WebRequest -Uri "$base/citas?fecha=$hoy&doctorId=$($doc2.id)" -Headers $h -UseBasicParsing).Content
Write-Output "FILTRO DOCTOR: doc1=$($citasDoc1.Count) (esp 1) doc2=$($citasDoc2.Count) (esp 0)"

# 7. Desglose caja: pagar la cita de hoy y verificar campos nuevos
$cobro = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h
Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 2000; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
$cajaHoy = Invoke-RestMethod -Uri "$base/caja/hoy" -Headers $h
Write-Output "CAJA: pagosDeudaAnterior=$($cajaHoy.pagosDeudaAnterior) (esp 0, cita es de hoy) nuevasDeudas=$($cajaHoy.nuevasDeudas) (esp 3000)"

# 8. Historial de cajas
$histRaw = (Invoke-WebRequest -Uri "$base/caja/historial?desde=$(Get-Date -Format 'yyyy-MM-01')&hasta=$hoy" -Headers $h -UseBasicParsing).Content
$hist = ConvertFrom-Json -InputObject $histRaw
Write-Output "HISTORIAL: $($hist.Count) caja(s) en el mes (esp >= 1)"
