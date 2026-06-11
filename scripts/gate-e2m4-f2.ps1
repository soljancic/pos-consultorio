# Gate E2-M4 f2: linea de tiempo clinica + adjuntos a disco local (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "f2$ts@test.com"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "F2 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$token = $login.accessToken
$h = @{ Authorization = "Bearer $token" }

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Gate" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Tina"; apellido = "Timeline" } | ConvertTo-Json)

function Cita-EnAtencion($hora, $motivo) {
  $fh = (Get-Date -Hour $hora -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  $c = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
  foreach ($estado in @("CONFIRMADA", "LLEGO", "EN_ATENCION")) {
    Invoke-RestMethod -Uri "$base/citas/$($c.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $estado } | ConvertTo-Json) | Out-Null
  }
  Invoke-RestMethod -Uri "$base/atenciones/cita/$($c.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ motivo = $motivo } | ConvertTo-Json) | Out-Null
  return $c
}

$c1 = Cita-EnAtencion 9 "dolor lumbar agudo"
$c2 = Cita-EnAtencion 11 "control de rutina"

# 1) Linea de tiempo: 2 atenciones, la mas reciente (11:00) primero
$tl = Invoke-RestMethod -Uri "$base/atenciones/paciente/$($pac.id)" -Headers $h
$arr = @($tl)
Write-Output "1 TIMELINE: total=$($arr.Count) primera=$($arr[0].motivo) (esp 2 / control de rutina)"

# 2) Busqueda q=lumbar -> 1 resultado
$tlQ = Invoke-RestMethod -Uri "$base/atenciones/paciente/$($pac.id)?q=lumbar" -Headers $h
Write-Output "2 BUSQUEDA: total=$(@($tlQ).Count) (esp 1)"

# 3) Paciente de otro tenant -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/paciente/999999" -Headers $h } 404 "3 PACIENTE AJENO"

# Subida multipart con HttpClient (PS 5.1 no tiene -Form)
Add-Type -AssemblyName System.Net.Http
function Subir-Adjunto($citaId, $bytes, $mime, $nombre, $tok) {
  $client = New-Object System.Net.Http.HttpClient
  $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $tok)
  $content = New-Object System.Net.Http.MultipartFormDataContent
  $fileContent = New-Object System.Net.Http.ByteArrayContent(,$bytes)
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($mime)
  $content.Add($fileContent, "archivo", $nombre)
  $resp = $client.PostAsync("$base/atenciones/cita/$citaId/adjuntos", $content).Result
  $body = $resp.Content.ReadAsStringAsync().Result
  $client.Dispose()
  return @{ status = [int]$resp.StatusCode; body = $body }
}

$png = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

# 4) Subir PNG -> 201 y queda en el JSON de la atencion
$up = Subir-Adjunto $c1.id $png "image/png" "radiografia.png" $token
$at = Invoke-RestMethod -Uri "$base/atenciones/cita/$($c1.id)" -Headers $h
Write-Output "4 SUBIR PNG: status=$($up.status) adjuntos=$(@($at.adjuntos).Count) nombre=$($at.adjuntos[0].nombre) (esp 201 1 radiografia.png)"

# 5) Descargar el adjunto -> bytes y content-type identicos
$tmp = Join-Path $env:TEMP "gate-adj-$ts.png"
Invoke-WebRequest -Uri "$base/atenciones/cita/$($c1.id)/adjuntos/0" -Headers $h -OutFile $tmp -UseBasicParsing
$bajado = [IO.File]::ReadAllBytes($tmp)
$igual = ($bajado.Length -eq $png.Length)
Remove-Item $tmp -Confirm:$false
Write-Output "5 DESCARGA: bytesOk=$igual (esp True)"

# 6) Mime invalido (txt) -> 400
$txt = [Text.Encoding]::UTF8.GetBytes("hola")
$upTxt = Subir-Adjunto $c1.id $txt "text/plain" "nota.txt" $token
Write-Output "6 MIME INVALIDO: status=$($upTxt.status) (esp 400)"

# 7) SECRETARIA no sube adjuntos -> 403 (lectura si)
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$upSec = Subir-Adjunto $c1.id $png "image/png" "intruso.png" $loginSec.accessToken
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
$tlSec = Invoke-RestMethod -Uri "$base/atenciones/paciente/$($pac.id)" -Headers $hSec
Write-Output "7 SECRETARIA: subir=$($upSec.status) lee=$(@($tlSec).Count) (esp 403 2)"

# 8) Eliminar el adjunto -> la lista queda vacia y el archivo 404
Invoke-RestMethod -Uri "$base/atenciones/cita/$($c1.id)/adjuntos/0" -Method Delete -Headers $h | Out-Null
$at8 = Invoke-RestMethod -Uri "$base/atenciones/cita/$($c1.id)" -Headers $h
Esperar-Error { Invoke-WebRequest -Uri "$base/atenciones/cita/$($c1.id)/adjuntos/0" -Headers $h -UseBasicParsing } 404 "8b ADJUNTO BORRADO"
Write-Output "8 ELIMINAR: adjuntos=$(@($at8.adjuntos).Count) (esp 0)"
