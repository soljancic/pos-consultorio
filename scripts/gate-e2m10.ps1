# Gate E2-M10: emails de cuenta (invitacion + reset de contrasena) — API :3000
# Requiere MAIL_DEBUG=1 en apps/api/.env (expone devToken SOLO en dev)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "m10$ts@test.com"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "M10 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# 1) Crear usuario SIN password -> invitacion (devToken en dev) y login bloqueado
$nuevoEmail = "inv$ts@test.com"
$nuevo = Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Invitado"; email = $nuevoEmail; rol = "SECRETARIA" } | ConvertTo-Json)
Write-Output "1 ALTA SIN PASSWORD: id=$($nuevo.id -gt 0) devToken=$($null -ne $nuevo.devToken) (esp True True)"
Esperar-Error { Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $nuevoEmail; password = "loquesea123" } | ConvertTo-Json) } 401 "2 LOGIN BLOQUEADO"

# 3) Establecer password con el token -> 200 y el login funciona
Invoke-RestMethod -Uri "$base/auth/password/establecer" -Method Post -ContentType "application/json" -Body (@{ token = $nuevo.devToken; password = "MiClaveNueva1" } | ConvertTo-Json) | Out-Null
$loginNuevo = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $nuevoEmail; password = "MiClaveNueva1" } | ConvertTo-Json)
Write-Output "3 ESTABLECER + LOGIN: rol=$($loginNuevo.user.rol) (esp SECRETARIA)"

# 4) El token es de UN SOLO USO -> reusarlo da 400
Esperar-Error { Invoke-RestMethod -Uri "$base/auth/password/establecer" -Method Post -ContentType "application/json" -Body (@{ token = $nuevo.devToken; password = "OtraClave123" } | ConvertTo-Json) } 400 "4 TOKEN USADO"

# 5) Reset: solicitar con email existente devuelve devToken; con inexistente NO (misma respuesta ok)
$sol = Invoke-RestMethod -Uri "$base/auth/password/solicitar" -Method Post -ContentType "application/json" -Body (@{ email = $nuevoEmail } | ConvertTo-Json)
$solFake = Invoke-RestMethod -Uri "$base/auth/password/solicitar" -Method Post -ContentType "application/json" -Body (@{ email = "noexiste$ts@test.com" } | ConvertTo-Json)
Write-Output "5 NO ENUMERACION: existente ok=$($sol.ok) token=$($null -ne $sol.devToken) / inexistente ok=$($solFake.ok) token=$($null -eq $solFake.devToken) (esp True True True True)"

# 6) Reset completo: nueva clave entra, la vieja no
Invoke-RestMethod -Uri "$base/auth/password/establecer" -Method Post -ContentType "application/json" -Body (@{ token = $sol.devToken; password = "ClaveReseteada1" } | ConvertTo-Json) | Out-Null
Esperar-Error { Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $nuevoEmail; password = "MiClaveNueva1" } | ConvertTo-Json) } 401 "6a CLAVE VIEJA"
$loginReset = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $nuevoEmail; password = "ClaveReseteada1" } | ConvertTo-Json)
Write-Output "6b CLAVE NUEVA: login ok=$($null -ne $loginReset.accessToken) (esp True)"

# 7) Solicitar 2 veces invalida el token anterior
$t1 = (Invoke-RestMethod -Uri "$base/auth/password/solicitar" -Method Post -ContentType "application/json" -Body (@{ email = $nuevoEmail } | ConvertTo-Json)).devToken
$t2 = (Invoke-RestMethod -Uri "$base/auth/password/solicitar" -Method Post -ContentType "application/json" -Body (@{ email = $nuevoEmail } | ConvertTo-Json)).devToken
Esperar-Error { Invoke-RestMethod -Uri "$base/auth/password/establecer" -Method Post -ContentType "application/json" -Body (@{ token = $t1; password = "NoDeberia123" } | ConvertTo-Json) } 400 "7 TOKEN ANTERIOR INVALIDADO"

# 8) Token con formato invalido -> 400 del DTO; password corta -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/auth/password/establecer" -Method Post -ContentType "application/json" -Body (@{ token = "zzz"; password = "MiClaveNueva1" } | ConvertTo-Json) } 400 "8a TOKEN MALFORMADO"
Esperar-Error { Invoke-RestMethod -Uri "$base/auth/password/establecer" -Method Post -ContentType "application/json" -Body (@{ token = $t2; password = "corta" } | ConvertTo-Json) } 400 "8b PASSWORD CORTA"

# 9) Crear usuario CON password sigue funcionando igual (compat gates viejos)
$conPass = Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Directo"; email = "dir$ts@test.com"; password = "Password123!"; rol = "CAJA" } | ConvertTo-Json)
$loginDir = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = "dir$ts@test.com"; password = "Password123!" } | ConvertTo-Json)
Write-Output "9 ALTA CON PASSWORD: login directo ok=$($null -ne $loginDir.accessToken) devToken=$($null -eq $conPass.devToken) (esp True True)"
