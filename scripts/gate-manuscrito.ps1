# Gate notas manuscritas: CRUD de hojas + guards + topes (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "man$ts@test.com"

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

function Hoja($nPuntos) {
  $puntos = @()
  for ($i = 0; $i -lt $nPuntos; $i++) { $puntos += ,@(($i % 1200), 100.5, 0.6) }
  return @{ v = 1; w = 1240; h = 1754; strokes = @(@{ c = "#111827"; s = 4; p = $puntos }) }
}

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "Man $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sesion"; duracionMin = 50; precioBase = 200 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dra. Psi" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Ana"; apellido = "Manuscrita" } | ConvertTo-Json)

$fh = (Get-Date -Hour 10 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)

# 1) Sin atencion registrada -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = (Hoja 5) } | ConvertTo-Json -Depth 10) } 400 "1 SIN ATENCION"

foreach ($estado in @("CONFIRMADA", "LLEGO", "EN_ATENCION")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $estado } | ConvertTo-Json) | Out-Null
}
Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ motivo = "primera sesion" } | ConvertTo-Json) | Out-Null

# 2) Crear hoja -> orden 1
$h1 = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = (Hoja 5) } | ConvertTo-Json -Depth 10)
Write-Output "2 CREAR HOJA: orden=$($h1.orden) (esp 1)"

# 3) Segunda hoja -> orden 2
$h2 = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = (Hoja 5) } | ConvertTo-Json -Depth 10)
Write-Output "3 SEGUNDA HOJA: orden=$($h2.orden) (esp 2)"

# 4) Actualizar trazos de la hoja 1
$upd = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas/$($h1.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ trazos = (Hoja 9) } | ConvertTo-Json -Depth 10)
Write-Output "4 ACTUALIZAR: puntos=$($upd.trazos.strokes[0].p.Count) (esp 9)"

# 5) Version invalida -> 400
$mala = Hoja 3; $mala.v = 99
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = $mala } | ConvertTo-Json -Depth 10) } 400 "5 VERSION INVALIDA"

# 6) Punto fuera de la hoja -> 400
$fuera = Hoja 1; $fuera.strokes[0].p = @(,@(99999, 10, 0.5))
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = $fuera } | ConvertTo-Json -Depth 10) } 400 "6 PUNTO FUERA"

# 7) Trazos sin objeto (rompe el DTO) -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = "no soy objeto" } | ConvertTo-Json) } 400 "7 DTO INVALIDO"

# 8) SECRETARIA: lee si, escribe no
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
$leeSec = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Headers $hSec
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ trazos = (Hoja 3) } | ConvertTo-Json -Depth 10) } 403 "8b SECRETARIA ESCRIBE"
Write-Output "8 SECRETARIA LEE: hojas=$(@($leeSec).Count) (esp 2)"

# 9) Otro tenant no ve ni pisa la hoja
$email2 = "otro$ts@test.com"
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "Otro $ts"; adminNombre = "Admin"; email = $email2; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login2 = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email2; password = "Password123!" } | ConvertTo-Json)
$h2t = @{ Authorization = "Bearer $($login2.accessToken)" }
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas/$($h1.id)" -Method Put -Headers $h2t -ContentType "application/json" -Body (@{ trazos = (Hoja 3) } | ConvertTo-Json -Depth 10) } 404 "9 OTRO TENANT"

# 10) Borrado soft: deja de listarse
Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas/$($h2.id)" -Method Delete -Headers $h | Out-Null
$tras = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Headers $h
Write-Output "10 BORRADO SOFT: hojas=$(@($tras).Count) (esp 1)"

# 11) El orden de una hoja borrada NO se reutiliza (regresion del @@unique)
$h3 = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = (Hoja 4) } | ConvertTo-Json -Depth 10)
Write-Output "11 ORDEN TRAS BORRAR: orden=$($h3.orden) (esp 3, NO 2)"

# 12) Hoja inexistente -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas/999999" -Method Delete -Headers $h } 404 "12 HOJA INEXISTENTE"

Write-Output ""
Write-Output "Nota: el caso de transcribir sin ANTHROPIC_API_KEY (503) y el tope de 20 hojas"
Write-Output "se verifican a mano; el primero requiere la env vacia y el segundo 20 POSTs."
