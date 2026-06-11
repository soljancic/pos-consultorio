# Gate E2-M3: actividad reciente sobre logs (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "e2m3$ts@test.com"
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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E2M3 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null

# Generar actividad: cita con estados + pago + gasto
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. L" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Log"; apellido = "Eado" } | ConvertTo-Json)
$fh = (Get-Date -Hour 9 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
foreach ($e in @('CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA')) {
  Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$cobro = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h
Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 1000; formaPago = "EFECTIVO" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; categoria = "OTROS"; monto = 50; descripcion = "varios"; cuenta = "BANCO" } | ConvertTo-Json) | Out-Null

# 1) Feed completo del dia: deben existir STATE_CHANGE, PAYMENT y CREATE de Gasto
$todo = Invoke-RestMethod -Uri "$base/logs?desde=$hoy&hasta=$hoy" -Headers $h
$acciones = $todo.items | Select-Object -ExpandProperty accion -Unique
Write-Output "1 FEED: total=$($todo.total) (esp >= 6) acciones=$($acciones -join ',')"

# 2) Filtro por accion PAYMENT
$pagos = Invoke-RestMethod -Uri "$base/logs?accion=PAYMENT&desde=$hoy&hasta=$hoy" -Headers $h
$soloPagos = @($pagos.items | Where-Object { $_.accion -ne 'PAYMENT' }).Count
Write-Output "2 FILTRO ACCION: items=$($pagos.total) (esp >= 1) intrusos=$soloPagos (esp 0)"

# 3) Filtro por entidad Gasto
$gastosLog = Invoke-RestMethod -Uri "$base/logs?entidad=Gasto" -Headers $h
Write-Output "3 FILTRO ENTIDAD: items=$($gastosLog.total) (esp 1) usuario=$($gastosLog.items[0].usuario.nombre) (esp Admin)"

# 4) SECRETARIA -> 403
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
Esperar-Error { Invoke-RestMethod -Uri "$base/logs" -Method Get -Headers $hSec } 403 "4 SECRETARIA LEE LOGS"

# 5) Paginacion: page enorme devuelve vacio con total estable
$p99 = Invoke-RestMethod -Uri "$base/logs?page=99&desde=$hoy&hasta=$hoy" -Headers $h
Write-Output "5 PAGINACION: page=$($p99.page) items=$(@($p99.items).Count) (esp 0) total=$($p99.total) (esp = feed)"
