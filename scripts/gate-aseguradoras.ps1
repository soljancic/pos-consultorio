# Gate Catalogos: Aseguradoras / CategoriasSeguro / TarifasCobertura + flag trabajaConAseguradoras (API en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "aseg$ts@test.com"

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

# Crear tenant fresco
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "ASEG $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# 1) Flag trabajaConAseguradoras = false en tenant nuevo (GET /consultorio)
$cons = Invoke-RestMethod -Uri "$base/consultorio" -Headers $h
Write-Output "1 FLAG DEFAULT: trabajaConAseguradoras=$($cons.trabajaConAseguradoras) (esp False)"

# 2) PUT /consultorio { trabajaConAseguradoras = true } -> respuesta trae true
$consUp = Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ trabajaConAseguradoras = $true } | ConvertTo-Json)
Write-Output "2 FLAG TOGGLE: trabajaConAseguradoras=$($consUp.trabajaConAseguradoras) (esp True)"

# 3) Re-login: el user del token trae el flag (en un tenant nuevo recien creado es false antes del toggle)
$login2 = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
# Tras el PUT el flag en BD es true; el re-login debe leerlo y traerlo como true
Write-Output "3 FLAG EN LOGIN: user.trabajaConAseguradoras=$($login2.user.trabajaConAseguradoras) (esp True)"

# 4) POST /aseguradoras { nombre = "BISA" } -> crea; GET /aseguradoras -> count 1
$bisa = Invoke-RestMethod -Uri "$base/aseguradoras" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "BISA" } | ConvertTo-Json)
$listaAseg = @(Invoke-RestMethod -Uri "$base/aseguradoras" -Headers $h)
Write-Output "4 CREAR ASEGURADORA: id=$($null -ne $bisa.id) (esp True) count=$($listaAseg.Count) (esp 1)"

# 5) POST /aseguradoras sin nombre -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/aseguradoras" -Method Post -Headers $h -ContentType "application/json" -Body (@{ contacto = "sin nombre" } | ConvertTo-Json) } 400 "5 ASEGURADORA SIN NOMBRE"

# 6) POST /categorias-seguro { aseguradoraId, nombre, porcentajeCobertura = 80 } -> crea
$cat80 = Invoke-RestMethod -Uri "$base/categorias-seguro" -Method Post -Headers $h -ContentType "application/json" -Body (@{ aseguradoraId = $bisa.id; nombre = "Cat 80%"; porcentajeCobertura = 80 } | ConvertTo-Json)
Write-Output "6 CREAR CATEGORIA: id=$($null -ne $cat80.id) (esp True) porcentaje=$($cat80.porcentajeCobertura) (esp 80)"

# 7) POST /categorias-seguro con porcentajeCobertura = 150 -> 400 (Max 100)
Esperar-Error { Invoke-RestMethod -Uri "$base/categorias-seguro" -Method Post -Headers $h -ContentType "application/json" -Body (@{ aseguradoraId = $bisa.id; nombre = "Invalida"; porcentajeCobertura = 150 } | ConvertTo-Json) } 400 "7 COBERTURA FUERA DE RANGO"

# 8) Crear servicio, luego PUT /tarifas-cobertura, luego GET /tarifas-cobertura -> 1 fila con montoAseguradora 168
$svc = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta General"; duracionMin = 30; precioBase = 200 } | ConvertTo-Json)
$tarifasBody = @{
  categoriaSeguroId = $cat80.id
  tarifas = @(@{ servicioId = $svc.id; montoPaciente = 0; montoAseguradora = 168 })
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$base/tarifas-cobertura" -Method Put -Headers $h -ContentType "application/json" -Body $tarifasBody | Out-Null
$tarifas = @(Invoke-RestMethod -Uri "$base/tarifas-cobertura?categoriaSeguroId=$($cat80.id)" -Headers $h)
Write-Output "8 TARIFAS: count=$($tarifas.Count) (esp 1) montoAseguradora=$($tarifas[0].montoAseguradora) (esp 168.00)"

# 9) DELETE /aseguradoras/:id con categorias -> { eliminado=false, enUso=true } y activa=false
$delBisa = Invoke-RestMethod -Uri "$base/aseguradoras/$($bisa.id)" -Method Delete -Headers $h
Write-Output "9 ELIMINAR CON CATEGORIAS: eliminado=$($delBisa.eliminado) (esp False) enUso=$($delBisa.enUso) (esp True) activa=$($delBisa.aseguradora.activa) (esp False)"

# 10) Rol SECRETARIA: POST /aseguradoras -> 403; GET /aseguradoras/activas -> OK
$secEmail = "asegsec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
Esperar-Error { Invoke-RestMethod -Uri "$base/aseguradoras" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ nombre = "Hack" } | ConvertTo-Json) } 403 "10a SECRETARIA CREA ASEGURADORA"
$activas = @(Invoke-RestMethod -Uri "$base/aseguradoras/activas" -Headers $hSec)
Write-Output "10b SECRETARIA LEE ACTIVAS: count=$($activas.Count) (esp 0)"
