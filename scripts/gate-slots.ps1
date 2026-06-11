# Gate: GET /doctores/:id/disponibilidad sobre el Calendario de Atencion (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "slots$ts@test.com"
$hoy = Get-Date -Format "yyyy-MM-dd"

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "Slots $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Slot" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Slo"; apellido = "Teado" } | ConvertTo-Json)

# 1) Sin calendario -> modo sin-calendario
$r1 = Invoke-RestMethod -Uri "$base/doctores/$($doc.id)/disponibilidad?fecha=$hoy" -Headers $h
Write-Output "1 SIN CALENDARIO: modo=$($r1.modo) (esp sin-calendario) slots=$(@($r1.slots).Count) (esp 0)"

# 2) Bloque 09-11 -> 4 slots de 30
Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $doc.id; fecha = $hoy; horaInicio = "09:00"; horaFin = "11:00" } | ConvertTo-Json) | Out-Null
$r2 = Invoke-RestMethod -Uri "$base/doctores/$($doc.id)/disponibilidad?fecha=$hoy" -Headers $h
Write-Output "2 BLOQUE 09-11: slots=$(@($r2.slots).Count) (esp 4) primero=$($r2.slots[0]) (esp 09:00)"

# 3) Cita 09:30 -> el slot 09:30 desaparece
$fh = ([DateTime]"$hoy").AddHours(9).AddMinutes(30).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json) | Out-Null
$r3 = Invoke-RestMethod -Uri "$base/doctores/$($doc.id)/disponibilidad?fecha=$hoy" -Headers $h
$tiene0930 = @($r3.slots) -contains "09:30"
Write-Output "3 CON CITA 09:30: slots=$(@($r3.slots).Count) (esp 3) contiene0930=$tiene0930 (esp False)"

# 4) Bloqueo REUNION 10:00-10:30 pisa el bloque -> quedan 09:00 y 10:30
Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $doc.id; fecha = $hoy; horaInicio = "10:00"; horaFin = "10:30"; tipo = "REUNION" } | ConvertTo-Json) | Out-Null
$r4 = Invoke-RestMethod -Uri "$base/doctores/$($doc.id)/disponibilidad?fecha=$hoy" -Headers $h
Write-Output "4 CON REUNION 10-1030: slots=$($r4.slots -join ',') (esp 09:00,10:30)"

# 5) duracionMin=60 -> ningun hueco de 1h libre
$r5 = Invoke-RestMethod -Uri "$base/doctores/$($doc.id)/disponibilidad?fecha=$hoy&duracionMin=60" -Headers $h
Write-Output "5 SLOTS DE 60: slots=$(@($r5.slots).Count) (esp 0) disponible=$($r5.disponible) (esp False)"
