# Gate calendario f2b: plantillas de horario nombradas (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "pl$ts@test.com"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "PL $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# 1) Crear plantilla
$p1 = Invoke-RestMethod -Uri "$base/plantillas-horario" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Manana corta"; horaInicio = "08:00"; horaFin = "12:00" } | ConvertTo-Json)
Write-Output "1 CREAR: nombre=$($p1.nombre) rango=$($p1.horaInicio)-$($p1.horaFin) (esp Manana corta 08:00-12:00)"

# 2) Nombre duplicado (case-insensitive) -> 409
Esperar-Error { Invoke-RestMethod -Uri "$base/plantillas-horario" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "MANANA CORTA"; horaInicio = "09:00"; horaFin = "13:00" } | ConvertTo-Json) } 409 "2 DUPLICADA"

# 3) horaFin <= horaInicio -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/plantillas-horario" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Invertida"; horaInicio = "12:00"; horaFin = "08:00" } | ConvertTo-Json) } 400 "3 RANGO INVERTIDO"

# 4) Listar -> 1
$lista = Invoke-RestMethod -Uri "$base/plantillas-horario" -Headers $h
Write-Output "4 LISTAR: total=$(@($lista).Count) (esp 1)"

# 5) SECRETARIA no crea (403) pero si lista
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
Esperar-Error { Invoke-RestMethod -Uri "$base/plantillas-horario" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ nombre = "Sec"; horaInicio = "09:00"; horaFin = "10:00" } | ConvertTo-Json) } 403 "5 SECRETARIA CREA"
$listaSec = Invoke-RestMethod -Uri "$base/plantillas-horario" -Headers $hSec
Write-Output "   SECRETARIA LISTA: total=$(@($listaSec).Count) (esp 1)"

# 6) DOCTOR vinculado SI crea
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Plantilla" } | ConvertTo-Json)
$docEmail = "doc$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Doc"; email = $docEmail; password = "Password123!"; rol = "DOCTOR"; doctorId = $doc.id } | ConvertTo-Json) | Out-Null
$loginDoc = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $docEmail; password = "Password123!" } | ConvertTo-Json)
$p2 = Invoke-RestMethod -Uri "$base/plantillas-horario" -Method Post -Headers @{ Authorization = "Bearer $($loginDoc.accessToken)" } -ContentType "application/json" -Body (@{ nombre = "Tarde"; horaInicio = "14:00"; horaFin = "18:00" } | ConvertTo-Json)
Write-Output "6 DOCTOR CREA: nombre=$($p2.nombre) (esp Tarde)"

# 7) Soft delete (ADMIN) -> desaparece del listado
Invoke-RestMethod -Uri "$base/plantillas-horario/$($p1.id)" -Method Delete -Headers $h | Out-Null
$lista2 = Invoke-RestMethod -Uri "$base/plantillas-horario" -Headers $h
Write-Output "7 SOFT DELETE: total=$(@($lista2).Count) (esp 1) queda=$($lista2[0].nombre) (esp Tarde)"

# 8) DELETE de SECRETARIA -> 403; tenant ajeno -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/plantillas-horario/$($p2.id)" -Method Delete -Headers $hSec } 403 "8a SECRETARIA BORRA"
Esperar-Error { Invoke-RestMethod -Uri "$base/plantillas-horario/999999" -Method Delete -Headers $h } 404 "8b TENANT AJENO"
