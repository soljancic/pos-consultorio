# Gate E2-M4 f1: guard duro de historia clinica + agenda DOCTOR forzada (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "e2m4$ts@test.com"
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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E2M4 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$docA = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Alfa" } | ConvertTo-Json)
$docB = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Beta" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Gabriel"; apellido = "Gate" } | ConvertTo-Json)

# Cita de Dr. Alfa hoy 10:00, llevada a EN_ATENCION
$fh = (Get-Date -Hour 10 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $docA.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
foreach ($estado in @("CONFIRMADA", "LLEGO", "EN_ATENCION")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $estado } | ConvertTo-Json) | Out-Null
}

# Usuarios: DOCTOR vinculado a Alfa, DOCTOR vinculado a Beta, SECRETARIA
function Nuevo-Login($nombre, $mail, $rol, $doctorId) {
  $body = @{ nombre = $nombre; email = $mail; password = "Password123!"; rol = $rol }
  if ($doctorId) { $body.doctorId = $doctorId }
  Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body ($body | ConvertTo-Json) | Out-Null
  $l = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $mail; password = "Password123!" } | ConvertTo-Json)
  return @{ Authorization = "Bearer $($l.accessToken)" }
}
$hDocA = Nuevo-Login "Dra Alfa" "da$ts@test.com" "DOCTOR" $docA.id
$hDocB = Nuevo-Login "Dr Beta" "db$ts@test.com" "DOCTOR" $docB.id
$hSec = Nuevo-Login "Secre" "se$ts@test.com" "SECRETARIA" $null

# 1) ADMIN escribe la atencion -> 200
$at = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ motivo = "control admin" } | ConvertTo-Json)
Write-Output "1 ADMIN ESCRIBE: motivo=$($at.motivo) (esp control admin)"

# 2) SECRETARIA escribe -> 403
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Method Put -Headers $hSec -ContentType "application/json" -Body (@{ motivo = "intruso" } | ConvertTo-Json) } 403 "2 SECRETARIA ESCRIBE"

# 3) DOCTOR ajeno (Beta) escribe en cita de Alfa -> 403
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Method Put -Headers $hDocB -ContentType "application/json" -Body (@{ motivo = "intruso" } | ConvertTo-Json) } 403 "3 DOCTOR AJENO ESCRIBE"

# 4) DOCTOR propio (Alfa) escribe -> 200
$at4 = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Method Put -Headers $hDocA -ContentType "application/json" -Body (@{ motivo = "control doctor"; diagnostico = "ok" } | ConvertTo-Json)
Write-Output "4 DOCTOR PROPIO ESCRIBE: motivo=$($at4.motivo) (esp control doctor)"

# 5) SECRETARIA lee la atencion -> 200 (la lectura sigue abierta al staff)
$at5 = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Headers $hSec
Write-Output "5 SECRETARIA LEE: diagnostico=$($at5.diagnostico) (esp ok)"

# 6) Agenda forzada: DOCTOR Beta pide la agenda de Alfa via query -> solo ve lo suyo (0)
$citasB = Invoke-RestMethod -Uri "$base/citas?fecha=$hoy&doctorId=$($docA.id)" -Headers $hDocB
Write-Output "6 AGENDA FORZADA AJENA: citas=$(@($citasB).Count) (esp 0)"

# 7) DOCTOR Alfa ve su propia cita aunque pida otro doctorId
$citasA = Invoke-RestMethod -Uri "$base/citas?fecha=$hoy&doctorId=$($docB.id)" -Headers $hDocA
Write-Output "7 AGENDA PROPIA: citas=$(@($citasA).Count) (esp 1)"

# 8) ADMIN sigue viendo todo sin filtro
$citasAdmin = Invoke-RestMethod -Uri "$base/citas?fecha=$hoy" -Headers $h
Write-Output "8 AGENDA ADMIN: citas=$(@($citasAdmin).Count) (esp 1)"
