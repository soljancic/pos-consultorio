# Gate E2.5b: portal publico de reservas (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "e25b$ts@test.com"
$hoy = Get-Date -Format "yyyy-MM-dd"
$slug = "portal$ts"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E25B $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Portal" } | ConvertTo-Json)
Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $doc.id; fecha = $hoy; horaInicio = "09:00"; horaFin = "12:00" } | ConvertTo-Json) | Out-Null

# 1) Portal desactivado -> 404 (sin enumeracion)
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug" } 404 "1 PORTAL DESACTIVADO"

# 2) Activar con slug y leer info SIN token
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ slug = $slug; portalActivo = $true } | ConvertTo-Json) | Out-Null
$info = Invoke-RestMethod -Uri "$base/public/$slug"
Write-Output "2 INFO PUBLICA: consultorio=$($info.consultorio.nombre -ne $null) doctores=$(@($info.doctores).Count) (esp 1) servicios=$(@($info.servicios).Count) (esp 1)"

# 3) Slots publicos
$slots = Invoke-RestMethod -Uri "$base/public/$slug/slots?doctorId=$($doc.id)&servicioId=$($srv.id)&fecha=$hoy"
Write-Output "3 SLOTS: count=$(@($slots.slots).Count) (esp 6) primero=$($slots.slots[0]) (esp 09:00)"

# 4) Reservar 09:30 -> paciente nuevo + cita PENDIENTE origen PORTAL
$res = Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "09:30"; nombre = "Pia"; apellido = "Portal"; telefono = "+59170000001" } | ConvertTo-Json)
Write-Output "4 RESERVA: reservada=$($res.reservada) hora=$($res.hora) (esp 09:30) doctor=$($res.doctor)"
$citas = Invoke-RestMethod -Uri "$base/citas?fecha=$hoy" -Headers $h
$citaPortal = @($citas) | Where-Object { $_.origen -eq 'PORTAL' }
$pacs = Invoke-RestMethod -Uri "$base/pacientes?search=Portal" -Headers $h
Write-Output "   cita origen PORTAL=$(@($citaPortal).Count) (esp 1) estado=$($citaPortal[0].estado) (esp PENDIENTE) paciente creado=$(@($pacs).Count) (esp 1)"

# 5) Mismo telefono reserva de nuevo -> NO duplica paciente
Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "10:30"; nombre = "Pia"; apellido = "Portal"; telefono = "+59170000001" } | ConvertTo-Json) | Out-Null
$pacs2 = Invoke-RestMethod -Uri "$base/pacientes?search=Portal" -Headers $h
Write-Output "5 MATCH TELEFONO: pacientes=$(@($pacs2).Count) (esp 1, sin duplicar)"

# 6) Slot ocupado -> 409; consultorioId forjado -> 400 (whitelist)
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "09:30"; nombre = "X"; apellido = "Y"; telefono = "+59170000002" } | ConvertTo-Json) } 409 "6 SLOT OCUPADO"
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ consultorioId = 1; doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "11:00"; nombre = "X"; apellido = "Y"; telefono = "+59170000003" } | ConvertTo-Json) } 400 "7 CONSULTORIOID FORJADO"

# 8) Slug inexistente -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/public/no-existe-$ts" } 404 "8 SLUG INEXISTENTE"
