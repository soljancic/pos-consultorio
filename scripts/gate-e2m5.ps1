# Gate E2-M5: recetas PDF con membrete (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "e2m5$ts@test.com"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E2M5 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Receta"; especialidad = "Clinica" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Rita"; apellido = "Receta"; dni = "9$ts" } | ConvertTo-Json)

$fh = (Get-Date -Hour 10 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
foreach ($estado in @("CONFIRMADA", "LLEGO", "EN_ATENCION")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $estado } | ConvertTo-Json) | Out-Null
}

# 1) Receta sin atencion -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/recetas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ medicamentos = @("Ibuprofeno 400 mg c/8h") } | ConvertTo-Json) } 400 "1 SIN ATENCION"

Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ motivo = "cefalea" } | ConvertTo-Json) | Out-Null

# 2) Emitir receta -> 201 con contenido
$rec = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/recetas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ medicamentos = @("Ibuprofeno 400 mg c/8h por 5 dias", "Omeprazol 20 mg en ayunas"); indicaciones = "Reposo e hidratacion" } | ConvertTo-Json)
Write-Output "2 EMITIR: id=$($rec.id -gt 0) meds=$(@($rec.contenido.medicamentos).Count) (esp True 2)"

# 3) Listar -> 1
$lista = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/recetas" -Headers $h
Write-Output "3 LISTAR: total=$(@($lista).Count) (esp 1)"

# 4) PDF: %PDF magic bytes + content-type
$tmp = Join-Path $env:TEMP "gate-receta-$ts.pdf"
$resp = Invoke-WebRequest -Uri "$base/atenciones/recetas/$($rec.id)/pdf" -Headers $h -OutFile $tmp -PassThru -UseBasicParsing
$bytes = [IO.File]::ReadAllBytes($tmp)
$magic = [Text.Encoding]::ASCII.GetString($bytes[0..3])
Remove-Item $tmp -Confirm:$false
Write-Output "4 PDF: magic=$magic (esp %PDF) contentType=$($resp.Headers['Content-Type']) tamano=$($bytes.Length -gt 800)"

# 5) SECRETARIA no emite (403) pero si lista
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/recetas" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ medicamentos = @("X") } | ConvertTo-Json) } 403 "5 SECRETARIA EMITE"
$listaSec = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/recetas" -Headers $hSec
Write-Output "   SECRETARIA LISTA: total=$(@($listaSec).Count) (esp 1)"

# 6) Receta de otro tenant -> 404
$email2 = "otro$ts@test.com"
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "Otro $ts"; adminNombre = "Admin"; email = $email2; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login2 = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email2; password = "Password123!" } | ConvertTo-Json)
$h2 = @{ Authorization = "Bearer $($login2.accessToken)" }
Esperar-Error { Invoke-WebRequest -Uri "$base/atenciones/recetas/$($rec.id)/pdf" -Headers $h2 -UseBasicParsing } 404 "6 TENANT AJENO"

# 7) DTO invalido: medicamentos vacio -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/recetas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ medicamentos = @() } | ConvertTo-Json) } 400 "7 MEDICAMENTOS VACIO"
