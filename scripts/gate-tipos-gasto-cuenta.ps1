# Gate Catalogos: TipoGasto/TipoCuenta por consultorio + arqueo dinamico (API en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "cat$ts@test.com"
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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "CAT $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null # turno abierto

# 1) Defaults sembrados al registrar
$tg = Invoke-RestMethod -Uri "$base/tipos-gasto" -Headers $h
$tc = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h
$efectivo = $tc | Where-Object { $_.esEfectivo }
Write-Output "1 DEFAULTS: tiposGasto=$($tg.Count) (esp 6) tiposCuenta=$($tc.Count) (esp 3) efectivoNombre=$($efectivo.nombre) (esp Caja efectivo)"

# 2) Crear tipo de gasto
$nuevoTg = Invoke-RestMethod -Uri "$base/tipos-gasto" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Marketing" } | ConvertTo-Json)
$tg2 = Invoke-RestMethod -Uri "$base/tipos-gasto" -Headers $h
Write-Output "2 CREAR TIPO GASTO: total=$($tg2.Count) (esp 7) nuevoId=$($null -ne $nuevoTg.id) (esp True)"

# 3) Crear cuenta esEfectivo -> la anterior pierde el flag
$nuevaTc = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Mercado Pago"; esEfectivo = $true } | ConvertTo-Json)
$tcDespues = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h
$efectivosAhora = @($tcDespues | Where-Object { $_.esEfectivo })
# PS 5.1: envolver en @() para que .Count funcione sobre un resultado escalar
$nuevaEsEfectivo = (@($efectivosAhora | Where-Object { $_.id -eq $nuevaTc.id })).Count -eq 1
Write-Output "3 EFECTIVO UNICO: cuentasEfectivo=$($efectivosAhora.Count) (esp 1) laNuevaEsEfectivo=$nuevaEsEfectivo (esp True)"

# 4) Crear gasto con la cuenta efectivo nueva + tipo Marketing
$gasto = Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; tipoGastoId = $nuevoTg.id; monto = 500; descripcion = "ads"; tipoCuentaId = $nuevaTc.id } | ConvertTo-Json)
$lista = Invoke-RestMethod -Uri "$base/gastos?desde=$hoy&hasta=$hoy" -Headers $h
$g = $lista | Where-Object { $_.id -eq $gasto.id }
Write-Output "4 GASTO CON FK: tipoGastoNombre=$($g.tipoGasto.nombre) (esp Marketing) tipoCuentaNombre=$($g.tipoCuenta.nombre) (esp Mercado Pago)"

# 5) Arqueo dinamico: el gasto en la cuenta efectivo nueva descuenta
$caja = Invoke-RestMethod -Uri "$base/caja/hoy" -Headers $h
Write-Output "5 ARQUEO DINAMICO: egresosEfectivo=$($caja.egresosEfectivo) (esp 500) egresosTotales=$($caja.egresosTotales) (esp 500)"

# 6) No inactivar un tipo de gasto con gastos
Esperar-Error { Invoke-RestMethod -Uri "$base/tipos-gasto/$($nuevoTg.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ activo = $false } | ConvertTo-Json) } 409 "6 INACTIVAR TIPO EN USO"

# 7) DTO invalido (sin tipoGastoId)
Esperar-Error { Invoke-RestMethod -Uri "$base/gastos" -Method Post -Headers $h -ContentType "application/json" -Body (@{ fecha = $hoy; monto = 100; descripcion = "x"; tipoCuentaId = $nuevaTc.id } | ConvertTo-Json) } 400 "7 GASTO SIN TIPO"

# 8) SECRETARIA: no crea tipos (solo ADMIN) pero si lee activos
$secEmail = "catsec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
Esperar-Error { Invoke-RestMethod -Uri "$base/tipos-gasto" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ nombre = "Hack" } | ConvertTo-Json) } 403 "8a SECRETARIA CREA TIPO"
$activos = Invoke-RestMethod -Uri "$base/tipos-gasto/activos" -Headers $hSec
Write-Output "8b SECRETARIA LEE ACTIVOS: count=$($activos.Count) (esp 7)"
