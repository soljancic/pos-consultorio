$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "noct$ts@test.com"
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "Noct $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$token = $login.accessToken; if (-not $token) { $token = $login.access_token }
$h = @{ Authorization = "Bearer $token" }
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. N" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Noche"; apellido = "Tarde" } | ConvertTo-Json)

# Cita a las 21:00 LOCAL de hoy (en GMT-4 cae en el dia UTC siguiente)
$hoy = Get-Date -Format "yyyy-MM-dd"
$fh = (Get-Date -Hour 21 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json) | Out-Null

$citas = ConvertFrom-Json -InputObject (Invoke-WebRequest -Uri "$base/citas?fecha=$hoy" -Headers $h -UseBasicParsing).Content
Write-Output "CITA 21:00 LOCAL EN AGENDA DE HOY: $($citas.Count) (esperado 1) fechaHora=$($citas[0].fechaHora)"

# Y NO debe aparecer en la agenda de manana
$manana = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$citasM = ConvertFrom-Json -InputObject (Invoke-WebRequest -Uri "$base/citas?fecha=$manana" -Headers $h -UseBasicParsing).Content
$countM = if ($null -eq $citasM) { 0 } else { $citasM.Count }
Write-Output "EN AGENDA DE MANANA: $countM (esperado 0)"
