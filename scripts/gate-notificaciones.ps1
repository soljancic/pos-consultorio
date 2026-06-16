# Gate Centro de Notificaciones (API :3000). Crea su propio tenant.
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "ntf$ts@test.com"
$slug = "ntf$ts"
$man = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")  # manana (slots de hoy se filtran)

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
function Tipo-Count($lista, $tipo) { return @($lista | Where-Object { $_.tipo -eq $tipo }).Count }

# Setup: tenant admin + servicio + doctor + usuario DOCTOR vinculado + paciente
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "NTF $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Notif" } | ConvertTo-Json)
$docEmail = "drn$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dra Notif"; email = $docEmail; password = "Password123!"; rol = "DOCTOR"; doctorId = $doc.id } | ConvertTo-Json) | Out-Null
$loginDoc = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $docEmail; password = "Password123!" } | ConvertTo-Json)
$hDoc = @{ Authorization = "Bearer $($loginDoc.accessToken)" }
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Pia"; apellido = "Notif"; telefono = "+59170000001" } | ConvertTo-Json)

# Disponibilidad amplia manana (para portal + citas internas) y portal activo
Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $doc.id; fecha = $man; horaInicio = "07:00"; horaFin = "21:00" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ slug = $slug; portalActivo = $true } | ConvertTo-Json) | Out-Null

function Nueva-Cita($hora) {
  $fh = ([datetime]::ParseExact("$man $hora", "yyyy-MM-dd HH:mm", $null)).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  return Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
}
function Estado($citaId, $estado) {
  Invoke-RestMethod -Uri "$base/citas/$citaId/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $estado } | ConvertTo-Json) | Out-Null
}

# 1) NUEVA_CITA: reserva del portal -> SOLICITADA origen PORTAL (avisa admin)
Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $man; hora = "09:00"; nombre = "Pia"; apellido = "Notif"; telefono = "+59170000001"; email = "pia@notif.bo" } | ConvertTo-Json) | Out-Null

# 2) PACIENTE_EN_ESPERA: cita interna -> CONFIRMADA -> LLEGO (avisa doctor)
$cLlego = Nueva-Cita "10:00"
Estado $cLlego.id "CONFIRMADA"
Estado $cLlego.id "LLEGO"

# 3) CITA_CANCELADA: cita interna -> CANCELADA (avisa admin + doctor)
$cCancel = Nueva-Cita "11:00"
Estado $cCancel.id "CANCELADA"

# 4) CITA_REPROGRAMADA: cita interna -> reprogramar a 13:00 (avisa admin + doctor)
$cReprog = Nueva-Cita "12:00"
$fhNueva = ([datetime]::ParseExact("$man 13:00", "yyyy-MM-dd HH:mm", $null)).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
# reprogramar = PUT /citas/:id (editar fecha en el lugar), no una ruta aparte
Invoke-RestMethod -Uri "$base/citas/$($cReprog.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ fechaHora = $fhNueva } | ConvertTo-Json) | Out-Null

Start-Sleep -Milliseconds 600  # la emision es fire-and-forget

# 5) Bandeja admin: NUEVA(1) CANCELADA(1) REPROG(1) EN_ESPERA(0)
$adm = Invoke-RestMethod -Uri "$base/notificaciones" -Headers $h
Write-Output "5 ADMIN: nueva=$(Tipo-Count $adm 'NUEVA_CITA') (esp 1) cancel=$(Tipo-Count $adm 'CITA_CANCELADA') (esp 1) reprog=$(Tipo-Count $adm 'CITA_REPROGRAMADA') (esp 1) espera=$(Tipo-Count $adm 'PACIENTE_EN_ESPERA') (esp 0)"

# 6) Bandeja doctor: EN_ESPERA(1) CANCELADA(1) REPROG(1) NUEVA(0)
$drn = Invoke-RestMethod -Uri "$base/notificaciones" -Headers $hDoc
Write-Output "6 DOCTOR: espera=$(Tipo-Count $drn 'PACIENTE_EN_ESPERA') (esp 1) cancel=$(Tipo-Count $drn 'CITA_CANCELADA') (esp 1) reprog=$(Tipo-Count $drn 'CITA_REPROGRAMADA') (esp 1) nueva=$(Tipo-Count $drn 'NUEVA_CITA') (esp 0)"

# 7) citaFecha presente para deep-link
$nuevaItem = @($adm | Where-Object { $_.tipo -eq 'NUEVA_CITA' })[0]
Write-Output "7 DEEPLINK: citaFecha=$($nuevaItem.citaFecha) (esp $man) citaId=$([bool]$nuevaItem.citaId) (esp True)"

# 8) Conteo no leidas: admin=3, doctor=3
$cAdm = Invoke-RestMethod -Uri "$base/notificaciones/no-leidas/count" -Headers $h
$cDrn = Invoke-RestMethod -Uri "$base/notificaciones/no-leidas/count" -Headers $hDoc
Write-Output "8 COUNT: admin=$($cAdm.count) (esp 3) doctor=$($cDrn.count) (esp 3)"

# 9) Marcar una leida baja el conteo admin a 2
Invoke-RestMethod -Uri "$base/notificaciones/$($nuevaItem.id)/leida" -Method Patch -Headers $h | Out-Null
$cAdm2 = Invoke-RestMethod -Uri "$base/notificaciones/no-leidas/count" -Headers $h
Write-Output "9 LEIDA UNA: admin=$($cAdm2.count) (esp 2)"

# 10) Marcar todas (admin) deja el conteo en 0; el doctor sigue en 3
Invoke-RestMethod -Uri "$base/notificaciones/leidas" -Method Patch -Headers $h | Out-Null
$cAdm3 = Invoke-RestMethod -Uri "$base/notificaciones/no-leidas/count" -Headers $h
$cDrn2 = Invoke-RestMethod -Uri "$base/notificaciones/no-leidas/count" -Headers $hDoc
Write-Output "10 MARCAR TODAS: admin=$($cAdm3.count) (esp 0) doctor=$($cDrn2.count) (esp 3, intacto)"

# 11) Seguridad: el doctor no puede marcar una notif de la bandeja admin -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/notificaciones/$($nuevaItem.id)/leida" -Method Patch -Headers $hDoc } 404 "11 DOCTOR MARCA ADMIN"

# 12) Seguridad: id inexistente -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/notificaciones/999999/leida" -Method Patch -Headers $h } 404 "12 ID INEXISTENTE"
