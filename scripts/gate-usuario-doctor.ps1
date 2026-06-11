# Gate item 46: usuario DOCTOR vinculado a su Doctor + calendario propio (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "ud$ts@test.com"
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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "UD $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$docA = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Alfa" } | ConvertTo-Json)
$docB = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Beta" } | ConvertTo-Json)

# 1) Crear usuario DOCTOR vinculado a Dr. Alfa
$uDocEmail = "dra$ts@test.com"
$uDoc = Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dra Alfa"; email = $uDocEmail; password = "Password123!"; rol = "DOCTOR"; doctorId = $docA.id } | ConvertTo-Json)
Write-Output "1 VINCULO: doctorAsociado=$($uDoc.doctor.nombre) (esp Dr. Alfa)"

# 2) Vincular el MISMO doctor a otro usuario -> 409
Esperar-Error { Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Otro"; email = "otro$ts@test.com"; password = "Password123!"; rol = "DOCTOR"; doctorId = $docA.id } | ConvertTo-Json) } 409 "2 DOCTOR TOMADO"

# 3) doctorId con rol no-DOCTOR -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = "sec$ts@test.com"; password = "Password123!"; rol = "SECRETARIA"; doctorId = $docB.id } | ConvertTo-Json) } 400 "3 ROL INVALIDO"

# 4) El doctor logueado crea horario PROPIO (201) y ajeno (403)
$loginDoc = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $uDocEmail; password = "Password123!" } | ConvertTo-Json)
$hDoc = @{ Authorization = "Bearer $($loginDoc.accessToken)" }
$propio = Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $hDoc -ContentType "application/json" -Body (@{ doctorId = $docA.id; fecha = $hoy; horaInicio = "09:00"; horaFin = "13:00" } | ConvertTo-Json)
Write-Output "4 HORARIO PROPIO: ocurrencias=$($propio.ocurrencias) (esp 1)"
Esperar-Error { Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $hDoc -ContentType "application/json" -Body (@{ doctorId = $docB.id; fecha = $hoy; horaInicio = "09:00"; horaFin = "13:00" } | ConvertTo-Json) } 403 "5 HORARIO AJENO"

# 6) Editar/borrar bloque ajeno -> 403 (el ADMIN crea uno para Dr. Beta)
Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $docB.id; fecha = $hoy; horaInicio = "14:00"; horaFin = "18:00" } | ConvertTo-Json) | Out-Null
$bloques = Invoke-RestMethod -Uri "$base/disponibilidades?desde=$hoy&hasta=$hoy&doctorId=$($docB.id)" -Headers $h
Esperar-Error { Invoke-RestMethod -Uri "$base/disponibilidades/$($bloques[0].id)?alcance=uno" -Method Put -Headers $hDoc -ContentType "application/json" -Body (@{ horaFin = "19:00" } | ConvertTo-Json) } 403 "6 EDITAR AJENO"
Esperar-Error { Invoke-RestMethod -Uri "$base/disponibilidades/$($bloques[0].id)?alcance=uno" -Method Delete -Headers $hDoc } 403 "7 BORRAR AJENO"

# 8) SECRETARIA sigue sin poder crear -> 403
$secEmail = "sec2$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
Esperar-Error { Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ doctorId = $docA.id; fecha = $hoy; horaInicio = "19:00"; horaFin = "20:00" } | ConvertTo-Json) } 403 "8 SECRETARIA CREA"

# 9) Cambiar el rol del usuario suelta el vinculo
Invoke-RestMethod -Uri "$base/usuarios/$($uDoc.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ rol = "CAJA" } | ConvertTo-Json) | Out-Null
$docATras = (Invoke-RestMethod -Uri "$base/doctores" -Headers $h) | Where-Object { $_.id -eq $docA.id }
Write-Output "9 CAMBIO DE ROL SUELTA: usuarioId=$($null -eq $docATras.usuarioId) (esp True)"
