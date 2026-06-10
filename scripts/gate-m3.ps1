$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "m3$ts@test.com"
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "M3 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$token = $login.accessToken; if (-not $token) { $token = $login.access_token }
$h = @{ Authorization = "Bearer $token" }

# 1. Ciclo activar/desactivar servicio
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Limpieza"; duracionMin = 30; precioBase = 4000 } | ConvertTo-Json)
Invoke-RestMethod -Uri "$base/servicios/$($srv.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ activo = $false } | ConvertTo-Json) | Out-Null
$activos = @(Invoke-RestMethod -Uri "$base/servicios" -Headers $h)
$todos = @(Invoke-RestMethod -Uri "$base/servicios?todos=true" -Headers $h)
Write-Output "SERVICIO DESACTIVADO: en activos=$(@($activos | Where-Object { $_.id -eq $srv.id }).Count) (esp 0) | en todos=$(@($todos | Where-Object { $_.id -eq $srv.id }).Count) (esp 1)"
Invoke-RestMethod -Uri "$base/servicios/$($srv.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ activo = $true } | ConvertTo-Json) | Out-Null
$activos2 = @(Invoke-RestMethod -Uri "$base/servicios" -Headers $h)
Write-Output "REACTIVADO: en activos=$(@($activos2 | Where-Object { $_.id -eq $srv.id }).Count) (esp 1)"

# 2. PUT /doctores/:id (nuevo)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Viejo" } | ConvertTo-Json)
$docUpd = Invoke-RestMethod -Uri "$base/doctores/$($doc.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Nuevo"; colorAgenda = "#10B981" } | ConvertTo-Json)
Write-Output "PUT DOCTOR: nombre=$($docUpd.nombre) color=$($docUpd.colorAgenda)"

# 3. Crear usuario SECRETARIA y verificar permisos
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec Uno"; email = "sec$ts@test.com"; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
# PS 5.1: ConvertFrom-Json via pipeline no enumera arrays; usar -InputObject
$rawUsuarios = (Invoke-WebRequest -Uri "$base/usuarios" -Headers $h -UseBasicParsing).Content
$usuarios = ConvertFrom-Json -InputObject $rawUsuarios
$hashExpuesto = $rawUsuarios -match 'passwordHash'
Write-Output "USUARIOS: $($usuarios.Count) (esp 2) | hash expuesto: $hashExpuesto (esp False)"

$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = "sec$ts@test.com"; password = "Password123!" } | ConvertTo-Json)
$tokenSec = $loginSec.accessToken; if (-not $tokenSec) { $tokenSec = $loginSec.access_token }
$hSec = @{ Authorization = "Bearer $tokenSec" }
try {
  Invoke-RestMethod -Uri "$base/usuarios" -Headers $hSec | Out-Null
  Write-Output "GUARD ROL: FALLO (secretaria pudo listar usuarios)"
} catch { Write-Output "GUARD ROL: OK (403 para SECRETARIA en /usuarios)" }
try {
  Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $hSec -ContentType "application/json" -Body (@{ nombre = "Hackeado" } | ConvertTo-Json) | Out-Null
  Write-Output "GUARD CONSULTORIO: FALLO"
} catch { Write-Output "GUARD CONSULTORIO: OK (403 para SECRETARIA en PUT /consultorio)" }

# 4. Actualizar consultorio como ADMIN (campos nuevos)
$cons = Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ telefono = "555-1234"; direccion = "Calle Falsa 123"; moneda = "BOB" } | ConvertTo-Json)
Write-Output "CONSULTORIO: tel=$($cons.telefono) dir=$($cons.direccion) moneda=$($cons.moneda)"

# 5. Desactivar usuario: sigue visible en la lista con activo=false
$sec = $usuarios | Where-Object { $_.rol -eq 'SECRETARIA' }
Invoke-RestMethod -Uri "$base/usuarios/$($sec.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ activo = $false } | ConvertTo-Json) | Out-Null
$usuarios2 = ConvertFrom-Json -InputObject (Invoke-WebRequest -Uri "$base/usuarios" -Headers $h -UseBasicParsing).Content
$secInactivo = $usuarios2 | Where-Object { $_.id -eq $sec.id }
Write-Output "USUARIO DESACTIVADO: sigue visible=$($null -ne $secInactivo) (esp True) activo=$($secInactivo.activo) (esp False)"
