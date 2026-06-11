# Gate calendario f2a: servicios-por-doctor (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "ds$ts@test.com"
$manana = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$slug = "ds$ts"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "DS $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$s1 = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$s2 = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Limpieza"; duracionMin = 30; precioBase = 500 } | ConvertTo-Json)
$docA = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Solo Consulta" } | ConvertTo-Json)
$docB = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Todo" } | ConvertTo-Json)
foreach ($d in @($docA.id, $docB.id)) {
  Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $d; fecha = $manana; horaInicio = "09:00"; horaFin = "11:00" } | ConvertTo-Json) | Out-Null
}

# 1) Asignar S1 a doctor A
$asig = Invoke-RestMethod -Uri "$base/doctores/$($docA.id)/servicios" -Method Put -Headers $h -ContentType "application/json" -Body (@{ servicioIds = @($s1.id) } | ConvertTo-Json)
Write-Output "1 ASIGNAR: servicios=$(@($asig.servicios).Count) nombre=$($asig.servicios[0].nombre) (esp 1 Consulta)"

# 2) GET /doctores incluye los ids
$docs = Invoke-RestMethod -Uri "$base/doctores" -Headers $h
$a = @($docs) | Where-Object { $_.id -eq $docA.id }
Write-Output "2 LISTADO: docA servicios=$(@($a.servicios).Count) (esp 1)"

# Portal activo
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ slug = $slug; portalActivo = $true } | ConvertTo-Json) | Out-Null

# 3) Info publica expone servicioIds
$info = Invoke-RestMethod -Uri "$base/public/$slug"
$pA = @($info.doctores) | Where-Object { $_.id -eq $docA.id }
$pB = @($info.doctores) | Where-Object { $_.id -eq $docB.id }
Write-Output "3 INFO PUBLICA: A=$(@($pA.servicioIds).Count) (esp 1) B=$(@($pB.servicioIds).Count) (esp 0 = todos)"

# 4) Slots de A con el servicio que NO atiende -> vacio, modo no-atiende-servicio
$sl = Invoke-RestMethod -Uri "$base/public/$slug/slots?doctorId=$($docA.id)&servicioId=$($s2.id)&fecha=$manana"
Write-Output "4 SLOTS NO ATIENDE: count=$(@($sl.slots).Count) modo=$($sl.modo) (esp 0 no-atiende-servicio)"

# 5) Slots de A con SU servicio -> hay
$sl2 = Invoke-RestMethod -Uri "$base/public/$slug/slots?doctorId=$($docA.id)&servicioId=$($s1.id)&fecha=$manana"
Write-Output "5 SLOTS PROPIO: count=$(@($sl2.slots).Count) (esp 4)"

# 6) Reservar A con S2 -> 409
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $docA.id; servicioId = $s2.id; fecha = $manana; hora = "09:00"; nombre = "X"; apellido = "Y"; telefono = "+59171111111" } | ConvertTo-Json) } 409 "6 RESERVA NO ATIENDE"

# 7) Doctor B sin lista atiende cualquiera
$sl3 = Invoke-RestMethod -Uri "$base/public/$slug/slots?doctorId=$($docB.id)&servicioId=$($s2.id)&fecha=$manana"
Write-Output "7 SIN LISTA = TODOS: count=$(@($sl3.slots).Count) (esp 4)"

# 8) SECRETARIA no asigna -> 403
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
Esperar-Error { Invoke-RestMethod -Uri "$base/doctores/$($docA.id)/servicios" -Method Put -Headers @{ Authorization = "Bearer $($loginSec.accessToken)" } -ContentType "application/json" -Body (@{ servicioIds = @() } | ConvertTo-Json) } 403 "8 SECRETARIA ASIGNA"

# 9) Vaciar la lista vuelve a "atiende todos"
Invoke-RestMethod -Uri "$base/doctores/$($docA.id)/servicios" -Method Put -Headers $h -ContentType "application/json" -Body (@{ servicioIds = @() } | ConvertTo-Json) | Out-Null
$sl4 = Invoke-RestMethod -Uri "$base/public/$slug/slots?doctorId=$($docA.id)&servicioId=$($s2.id)&fecha=$manana"
Write-Output "9 LISTA VACIA: count=$(@($sl4.slots).Count) (esp 4)"
