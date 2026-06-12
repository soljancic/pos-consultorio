# Gate E3 item 41a: cola de mensajes pendientes manual asistida (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "mp$ts@test.com"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "MP $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Msj" } | ConvertTo-Json)
# Paciente CON telefono (entra a la cola) y paciente SIN telefono (no entra)
$pacTel = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Marta"; apellido = "Mensaje"; telefono = "+59172222222" } | ConvertTo-Json)
$pacSin = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sergio"; apellido = "SinFono" } | ConvertTo-Json)

# Cita HOY para ambos (PENDIENTE)
function Nueva-Cita($pacienteId, $hora) {
  $fh = (Get-Date -Hour $hora -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pacienteId; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
}
$c1 = Nueva-Cita $pacTel.id 15
Nueva-Cita $pacSin.id 16 | Out-Null

# Deuda: cita atendida sin pagar para pacTel
$c2 = Nueva-Cita $pacTel.id 9
foreach ($estado in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA", "CON_DEUDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($c2.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $estado } | ConvertTo-Json) | Out-Null
}

# 1) Generar: 1 recordatorio (solo el paciente con telefono; la cita CON_DEUDA no es PENDIENTE/CONFIRMADA) + 1 aviso de deuda
$g = Invoke-RestMethod -Uri "$base/mensajes/generar" -Method Post -Headers $h
Write-Output "1 GENERAR: recordatorios=$($g.recordatorios) (esp 1) deudas=$($g.avisosDeuda) (esp 1)"

# 2) Re-generar es idempotente (cita ya encolada, deuda avisada hace <7 dias)
$g2 = Invoke-RestMethod -Uri "$base/mensajes/generar" -Method Post -Headers $h
Write-Output "2 IDEMPOTENTE: recordatorios=$($g2.recordatorios) deudas=$($g2.avisosDeuda) (esp 0 0)"

# 3) Listar pendientes con datos del paciente y la cita
$lista = Invoke-RestMethod -Uri "$base/mensajes?estado=PENDIENTE" -Headers $h
$rec = @($lista) | Where-Object { $_.tipo -eq 'RECORDATORIO' }
Write-Output "3 LISTA: total=$(@($lista).Count) (esp 2) recCita=$($rec.cita.id -eq $c1.id) (esp True) telefono=$($rec.paciente.telefono) (esp +59172222222)"

# 4) Count para el badge
$count = Invoke-RestMethod -Uri "$base/mensajes/pendientes/count" -Headers $h
Write-Output "4 COUNT: pendientes=$($count.pendientes) (esp 2)"

# 5) Resolver como ENVIADO; re-resolver -> 400
Invoke-RestMethod -Uri "$base/mensajes/$($rec.id)/resolver" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "ENVIADO" } | ConvertTo-Json) | Out-Null
Esperar-Error { Invoke-RestMethod -Uri "$base/mensajes/$($rec.id)/resolver" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "OMITIDO" } | ConvertTo-Json) } 400 "5 RE-RESOLVER"

# 6) Estado invalido -> 400 (DTO); tenant ajeno -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/mensajes/$($rec.id)/resolver" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "PENDIENTE" } | ConvertTo-Json) } 400 "6a ESTADO INVALIDO"
Esperar-Error { Invoke-RestMethod -Uri "$base/mensajes/999999/resolver" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "ENVIADO" } | ConvertTo-Json) } 404 "6b TENANT AJENO"

# 7) Quedan 1 pendiente y 1 enviado
$pend = Invoke-RestMethod -Uri "$base/mensajes?estado=PENDIENTE" -Headers $h
$todos = Invoke-RestMethod -Uri "$base/mensajes" -Headers $h
$enviados = @($todos) | Where-Object { $_.estado -eq 'ENVIADO' }
Write-Output "7 RESUELTOS: pendientes=$(@($pend).Count) (esp 1) enviados=$(@($enviados).Count) (esp 1) por=$($enviados[0].resueltoPor.nombre) (esp Admin)"
