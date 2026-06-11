# Gate E2-M8: gastos administrativos + egresos en el arqueo (API en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "e2m8$ts@test.com"
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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E2M8 $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# Ingreso de 2000 en efectivo (cita atendida + pago)
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 2000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. G" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Gas"; apellido = "Tos" } | ConvertTo-Json)
$fh = (Get-Date -Hour 9 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
foreach ($e in @('CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA')) {
  Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$cobro = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita.id)" -Headers $h
Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ monto = 2000; formaPago = "EFECTIVO" } | ConvertTo-Json) | Out-Null

# 1) Crear gasto en efectivo + uno bancario; lista y resumen
$g1 = Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; categoria = "INSUMOS"; monto = 500; descripcion = "guantes"; cuenta = "CAJA_EFECTIVO"; personal = "farmacia" } | ConvertTo-Json)
Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; categoria = "SERVICIOS"; monto = 300; descripcion = "internet"; cuenta = "BANCO" } | ConvertTo-Json) | Out-Null
$lista = Invoke-RestMethod -Uri "$base/gastos?desde=$hoy&hasta=$hoy" -Headers $h
$resumen = Invoke-RestMethod -Uri "$base/gastos/resumen?desde=$hoy&hasta=$hoy" -Headers $h
Write-Output "1 CREAR/LISTAR: gastos=$($lista.Count) (esp 2) resumenTotal=$($resumen.total) (esp 800) insumos=$($resumen.porCategoria.INSUMOS) (esp 500)"

# 2) /caja/hoy expone egresos
$caja = Invoke-RestMethod -Uri "$base/caja/hoy" -Headers $h
Write-Output "2 CAJA HOY: egresosEfectivo=$($caja.egresosEfectivo) (esp 500) egresosTotales=$($caja.egresosTotales) (esp 800)"

# 3) Validacion DTO
Esperar-Error { Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; monto = 100; descripcion = "x"; cuenta = "BANCO" } | ConvertTo-Json) } 400 "3 SIN CATEGORIA"

# 4) SECRETARIA registra pero no edita ni borra
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
$gSec = Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ fecha = $hoy; categoria = "OTROS"; monto = 50; descripcion = "taxi"; cuenta = "OTRO" } | ConvertTo-Json)
Write-Output "4 SECRETARIA REGISTRA: id=$($null -ne $gSec.id) (esp True)"
Esperar-Error { Invoke-RestMethod -Uri "$base/gastos/$($g1.id)" -Method Put -Headers $hSec -ContentType "application/json" -Body (@{ monto = 1 } | ConvertTo-Json) } 403 "5 SECRETARIA EDITA"
Esperar-Error { Invoke-RestMethod -Uri "$base/gastos/$($g1.id)" -Method Delete -Headers $hSec } 403 "6 SECRETARIA BORRA"

# 7) ADMIN edita y borra (soft); el resumen corrige
Invoke-RestMethod -Uri "$base/gastos/$($g1.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ monto = 700 } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/gastos/$($gSec.id)" -Method Delete -Headers $h | Out-Null
$resumen2 = Invoke-RestMethod -Uri "$base/gastos/resumen?desde=$hoy&hasta=$hoy" -Headers $h
Write-Output "7 EDITAR+BORRAR: resumenTotal=$($resumen2.total) (esp 1000 = 700+300)"

# 8) Arqueo neto: efectivo cobrado 2000 - egreso efectivo 700 = 1300 -> diferencia 0
$cierre = Invoke-RestMethod -Uri "$base/caja/cerrar" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoDeclarado = 1300 } | ConvertTo-Json)
Write-Output "8 ARQUEO NETO: esperado=$($cierre.montoEsperado) (esp 1300) diferencia=$($cierre.diferencia) (esp 0) auto=$($null -ne $cierre.revisadaAt) (esp True)"
