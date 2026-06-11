# Gate E2.5a: Calendario de Atencion (API en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "e25a$ts@test.com"
$hoy = Get-Date -Format "yyyy-MM-dd"
$en14 = (Get-Date).AddDays(14).ToString("yyyy-MM-dd")
$manana = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E25A $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Cal" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Cali"; apellido = "Dario" } | ConvertTo-Json)

function Nueva-Cita($dia, $hora) {
  $fh = ([DateTime]"$dia").AddHours($hora).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
}

# 1) Serie todos los dias 09-17 hasta +14 (15 ocurrencias)
$serie = Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $doc.id; fecha = $hoy; horaInicio = "09:00"; horaFin = "17:00"; repetirDiasSemana = @(0,1,2,3,4,5,6); repetirHasta = $en14 } | ConvertTo-Json)
$bloques = Invoke-RestMethod -Uri "$base/disponibilidades?desde=$hoy&hasta=$en14" -Headers $h
Write-Output "1 SERIE: ocurrencias=$($serie.ocurrencias) (esp 15) listadas=$($bloques.Count) (esp 15) serieId=$($null -ne $serie.serieId)"

# 2) Bloque DISPONIBLE solapado el mismo dia -> 409
Esperar-Error { Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $doc.id; fecha = $hoy; horaInicio = "10:00"; horaFin = "12:00" } | ConvertTo-Json) } 409 "2 SOLAPE DISPONIBLE"

# 3) Cita dentro del horario (10:00) OK; fuera (21:00) -> 400
$c1 = Nueva-Cita $hoy 10
Write-Output "3 CITA DENTRO: id=$($null -ne $c1.id) (esp True)"
Esperar-Error { Nueva-Cita $hoy 21 } 400 "4 CITA FUERA DE HORARIO"

# 5) Bloqueo VACACIONES manana (pisa el bloque disponible: permitido) -> cita manana 409
Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $doc.id; fecha = $manana; horaInicio = "00:00"; horaFin = "23:59"; tipo = "VACACIONES" } | ConvertTo-Json) | Out-Null
Esperar-Error { Nueva-Cita $manana 10 } 409 "5 CITA EN VACACIONES"

# 6) SECRETARIA no crea horarios -> 403
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
Esperar-Error { Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ doctorId = $doc.id; fecha = $hoy; horaInicio = "18:00"; horaFin = "19:00" } | ConvertTo-Json) } 403 "6 SECRETARIA CREA"

# 7) Editar desde manana en adelante (serie) -> hoy intacto
$bloqueHoy = ($bloques | Where-Object { $_.fecha.Substring(0,10) -eq $hoy })[0]
$bloqueManana = ($bloques | Where-Object { $_.fecha.Substring(0,10) -eq $manana })[0]
$upd = Invoke-RestMethod -Uri "$base/disponibilidades/$($bloqueManana.id)?alcance=desde" -Method Put -Headers $h -ContentType "application/json" -Body (@{ horaFin = "13:00" } | ConvertTo-Json)
$bloquesTras = Invoke-RestMethod -Uri "$base/disponibilidades?desde=$hoy&hasta=$en14" -Headers $h
$hoyTras = ($bloquesTras | Where-Object { $_.fecha.Substring(0,10) -eq $hoy -and $_.tipo -eq 'DISPONIBLE' })[0]
Write-Output "7 EDITAR DESDE: afectadas=$($upd.actualizadas) (esp 14) hoyIntacto=$($hoyTras.horaFin) (esp 17:00)"

# 8) Borrar toda la serie -> el doctor vuelve a modo legacy (cita 21:00 OK)
Invoke-RestMethod -Uri "$base/disponibilidades/$($bloqueHoy.id)?alcance=serie" -Method Delete -Headers $h | Out-Null
# queda el bloqueo de VACACIONES de manana (no es de la serie) -> borrarlo tambien
$restantes = Invoke-RestMethod -Uri "$base/disponibilidades?desde=$hoy&hasta=$en14" -Headers $h
foreach ($r in @($restantes)) {
  if ($r.id) { Invoke-RestMethod -Uri "$base/disponibilidades/$($r.id)?alcance=uno" -Method Delete -Headers $h | Out-Null }
}
$c2 = Nueva-Cita $hoy 21
Write-Output "8 LEGACY TRAS BORRAR SERIE: cita 21:00 id=$($null -ne $c2.id) (esp True)"
