# Gate E3 item 11: barrido de no-shows + contador + requierePrepago (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "ns$ts@test.com"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "NS $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. NoShow" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Nina"; apellido = "Noshow" } | ConvertTo-Json)

function Cita-Pasada($horasAtras) {
  $fh = (Get-Date).AddHours(-$horasAtras).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
}

# 3 citas vencidas (24h, 26h, 28h atras; la segunda CONFIRMADA)
$c1 = Cita-Pasada 24
$c2 = Cita-Pasada 26
$c3 = Cita-Pasada 28
Invoke-RestMethod -Uri "$base/citas/$($c2.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "CONFIRMADA" } | ConvertTo-Json) | Out-Null
# Cita futura que NO debe tocarse
$fhFut = (Get-Date).AddDays(1).Date.AddHours(10).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cFut = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fhFut } | ConvertTo-Json)

# 1) SECRETARIA no puede barrer -> 403
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
Esperar-Error { Invoke-RestMethod -Uri "$base/citas/no-shows/procesar" -Method Post -Headers @{ Authorization = "Bearer $($loginSec.accessToken)" } } 403 "1 SECRETARIA BARRE"

# 2) Barrido ADMIN -> 3 procesadas (las vencidas del tenant)
$r = Invoke-RestMethod -Uri "$base/citas/no-shows/procesar" -Method Post -Headers $h
Write-Output "2 BARRIDO: procesadas=$($r.procesadas) (esp 3)"

# 3) Estados resultantes: vencidas NO_ASISTIO, futura intacta
$hoy = Get-Date -Format "yyyy-MM-dd"
$ayer = (Get-Date).AddDays(-2).ToString("yyyy-MM-dd")
$citas = Invoke-RestMethod -Uri "$base/citas?fecha=$ayer&hasta=$((Get-Date).AddDays(1).ToString('yyyy-MM-dd'))" -Headers $h
$noAsistio = @($citas) | Where-Object { $_.estado -eq 'NO_ASISTIO' }
$futura = @($citas) | Where-Object { $_.id -eq $cFut.id }
Write-Output "3 ESTADOS: noAsistio=$(@($noAsistio).Count) (esp 3) futura=$($futura.estado) (esp PENDIENTE)"

# 4) Contador y auto-flag al 3er no-show
$ficha = Invoke-RestMethod -Uri "$base/pacientes/$($pac.id)" -Headers $h
Write-Output "4 PACIENTE: noShows=$($ficha.noShows) (esp 3) requierePrepago=$($ficha.requierePrepago) (esp True)"

# 5) El search tambien lo expone (para la alerta del modal de cita)
$busqueda = Invoke-RestMethod -Uri "$base/pacientes?search=Noshow" -Headers $h
Write-Output "5 SEARCH: requierePrepago=$(@($busqueda)[0].requierePrepago) (esp True)"

# 6) Cobros de las vencidas quedaron ANULADO
$cobro1 = Invoke-RestMethod -Uri "$base/cobros/cita/$($c1.id)" -Headers $h
Write-Output "6 COBRO ANULADO: estado=$($cobro1.estado) (esp ANULADO)"

# 7) Re-barrer no duplica -> 0
$r2 = Invoke-RestMethod -Uri "$base/citas/no-shows/procesar" -Method Post -Headers $h
Write-Output "7 IDEMPOTENTE: procesadas=$($r2.procesadas) (esp 0)"

# 8) El staff desmarca el prepago a mano
Invoke-RestMethod -Uri "$base/pacientes/$($pac.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ requierePrepago = $false } | ConvertTo-Json) | Out-Null
$ficha2 = Invoke-RestMethod -Uri "$base/pacientes/$($pac.id)" -Headers $h
Write-Output "8 DESMARCAR: requierePrepago=$($ficha2.requierePrepago) (esp False)"
