# Gate E3 item 26: plantillas de WhatsApp editables (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "wt$ts@test.com"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "WT $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# 1) Por defecto los mensajes vienen null (el frontend usa el default)
$c = Invoke-RestMethod -Uri "$base/consultorio" -Headers $h
Write-Output "1 DEFAULTS: recordatorio=$($null -eq $c.msjRecordatorio) deuda=$($null -eq $c.msjDeuda) contacto=$($null -eq $c.msjContacto) (esp True True True)"

# 2) ADMIN edita las plantillas
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ msjRecordatorio = "Estimado {nombre}, su turno es a las {hora}"; msjDeuda = "Debe {monto}"; msjContacto = "Hola {nombre} de {consultorio}" } | ConvertTo-Json) | Out-Null
$c2 = Invoke-RestMethod -Uri "$base/consultorio" -Headers $h
Write-Output "2 EDITAR: recordatorio=$($c2.msjRecordatorio) (esp Estimado {nombre}, su turno es a las {hora})"

# 3) SECRETARIA LEE las plantillas (para armar el wa.me) pero NO edita
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
$cSec = Invoke-RestMethod -Uri "$base/consultorio" -Headers $hSec
Write-Output "3 SECRETARIA LEE: deuda=$($cSec.msjDeuda) (esp Debe {monto})"
Esperar-Error { Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $hSec -ContentType "application/json" -Body (@{ msjDeuda = "hack" } | ConvertTo-Json) } 403 "4 SECRETARIA EDITA"

# 5) Vaciar una plantilla vuelve al default ('' guardado; el front cae al default)
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ msjDeuda = "" } | ConvertTo-Json) | Out-Null
$c3 = Invoke-RestMethod -Uri "$base/consultorio" -Headers $h
Write-Output "5 VACIAR: deuda='$($c3.msjDeuda)' (esp vacio) recordatorio intacto=$($c3.msjRecordatorio -ne $null) (esp True)"

# 6) Mas de 400 caracteres -> 400
$largo = "x" * 401
Esperar-Error { Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ msjContacto = $largo } | ConvertTo-Json) } 400 "6 MUY LARGO"
