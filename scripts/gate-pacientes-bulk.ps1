# Gate Pacientes Bulk: paginacion + import XLSX + export + sample (API en :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "pacbulk$ts@test.com"

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

# --- Setup: tenant fresco ADMIN ---
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" `
  -Body (@{ consultorioNombre = "PACBULK $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# ====================================================================
# CASO 1: Paginacion
#   - Crear 4 pacientes
#   - GET ?page=1&limit=2 → items.Count=2, total>=4
#   - GET ?page=2&limit=2 → items distintos a pagina 1 (sin solapamiento de ids)
# ====================================================================
Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Ana";    apellido = "Gonzalez $ts" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Beto";   apellido = "Gonzalez $ts" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Carlos"; apellido = "Gonzalez $ts" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Diana";  apellido = "Gonzalez $ts" } | ConvertTo-Json) | Out-Null

$p1 = Invoke-RestMethod -Uri "$base/pacientes?page=1&limit=2" -Headers $h
$p2 = Invoke-RestMethod -Uri "$base/pacientes?page=2&limit=2" -Headers $h
$items1Count = @($p1.items).Count
$items2Count = @($p2.items).Count
$ids1 = @($p1.items | ForEach-Object { $_.id })
$ids2 = @($p2.items | ForEach-Object { $_.id })
# Solapamiento: cuantos ids de pagina 2 aparecen en pagina 1
$solapamiento = @($ids2 | Where-Object { $ids1 -contains $_ }).Count
Write-Output "1a PAGINACION p1: items=$items1Count (esp 2) total=$($p1.total) (esp >=4)"
Write-Output "1b PAGINACION p2: items=$items2Count (esp 2) solapamientoConP1=$solapamiento (esp 0)"

# ====================================================================
# CASO 2: Sample download
#   - GET /pacientes/import/sample → 200 + Content-Type spreadsheet + no vacio
# ====================================================================
$tmpXlsx = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "pac-sample-$ts.xlsx")
$sampleResp = Invoke-WebRequest -Uri "$base/pacientes/import/sample" -Headers $h -OutFile $tmpXlsx -PassThru
$sampleCT = $sampleResp.Headers['Content-Type']
$sampleSize = (Get-Item $tmpXlsx).Length
Write-Output "2 SAMPLE: status=$($sampleResp.StatusCode) (esp 200) contentType=$sampleCT (esp spreadsheet) bytes=$sampleSize (esp >0)"

# ====================================================================
# CASO 3a: Import primera vez → creados>=1
#   Usamos el archivo descargado en el caso 2 (tiene fila Juan Perez, DNI 12345678).
#   Multipart upload via System.Net.Http.HttpClient (PS 5.1 no tiene -Form directo).
# ====================================================================
$token = $login.accessToken
Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $token)

function Invoke-ImportXlsx($filePath, $actualizarExistentes) {
  $bytes = [System.IO.File]::ReadAllBytes($filePath)
  $multipart = [System.Net.Http.MultipartFormDataContent]::new()
  $fileContent = [System.Net.Http.ByteArrayContent]::new($bytes)
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  $multipart.Add($fileContent, "archivo", "import.xlsx")
  $strContent = [System.Net.Http.StringContent]::new($(if ($actualizarExistentes) { "true" } else { "false" }))
  $multipart.Add($strContent, "actualizarExistentes")
  $resp = $client.PostAsync("$base/pacientes/import", $multipart).GetAwaiter().GetResult()
  $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $resp.IsSuccessStatusCode) { throw "Import HTTP $([int]$resp.StatusCode): $body" }
  return $body | ConvertFrom-Json
}

$imp1 = Invoke-ImportXlsx $tmpXlsx $false
Write-Output "3a IMPORT PRIMERA VEZ: creados=$($imp1.creados) (esp >=1) actualizados=$($imp1.actualizados) (esp 0) omitidos=$($imp1.omitidos) (esp 0) errores=$(@($imp1.errores).Count) (esp 0)"

# ====================================================================
# CASO 3b: Reimportar sin actualizarExistentes → omitidos>=1, creados=0
# ====================================================================
$imp2 = Invoke-ImportXlsx $tmpXlsx $false
Write-Output "3b REIMPORT SIN ACTUALIZAR: creados=$($imp2.creados) (esp 0) omitidos=$($imp2.omitidos) (esp >=1)"

# ====================================================================
# CASO 3c: Reimportar con actualizarExistentes=true → actualizados>=1
# ====================================================================
$imp3 = Invoke-ImportXlsx $tmpXlsx $true
Write-Output "3c REIMPORT CON ACTUALIZAR: actualizados=$($imp3.actualizados) (esp >=1) creados=$($imp3.creados) (esp 0)"

# ====================================================================
# CASO 3d: Scope tenant — paciente importado aparece en GET /pacientes?search=
# ====================================================================
$busq = Invoke-RestMethod -Uri "$base/pacientes?search=Juan" -Headers $h
$encontrado = @($busq.items | Where-Object { $_.nombre -eq "Juan" }).Count -gt 0
Write-Output "3d SCOPE TENANT: jUanEncontrado=$encontrado (esp True)"

# ====================================================================
# CASO 4: Export
#   - GET /pacientes/export → 200 + Content-Type spreadsheet + no vacio
# ====================================================================
$tmpExport = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "pac-export-$ts.xlsx")
$exportResp = Invoke-WebRequest -Uri "$base/pacientes/export" -Headers $h -OutFile $tmpExport -PassThru
$exportCT = $exportResp.Headers['Content-Type']
$exportSize = (Get-Item $tmpExport).Length
Write-Output "4 EXPORT: status=$($exportResp.StatusCode) (esp 200) contentType=$exportCT (esp spreadsheet) bytes=$exportSize (esp >0)"

# ====================================================================
# CASO 5: Roles — SECRETARIA no puede acceder a import/export/sample
# ====================================================================
$secEmail = "pacbulksec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Sec Bulk"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }

Esperar-Error { Invoke-RestMethod -Uri "$base/pacientes/export" -Headers $hSec } 403 "5a SECRETARIA EXPORT"
Esperar-Error { Invoke-RestMethod -Uri "$base/pacientes/import/sample" -Headers $hSec } 403 "5b SECRETARIA SAMPLE"

# Import 403 via HttpClient con token de secretaria
$clientSec = [System.Net.Http.HttpClient]::new()
$clientSec.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $loginSec.accessToken)
$bytes = [System.IO.File]::ReadAllBytes($tmpXlsx)
$mpSec = [System.Net.Http.MultipartFormDataContent]::new()
$fcSec = [System.Net.Http.ByteArrayContent]::new($bytes)
$fcSec.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
$mpSec.Add($fcSec, "archivo", "import.xlsx")
$respSec = $clientSec.PostAsync("$base/pacientes/import", $mpSec).GetAwaiter().GetResult()
$secImportStatus = [int]$respSec.StatusCode
if ($secImportStatus -eq 403) { Write-Output "5c SECRETARIA IMPORT : OK (403)" }
else { Write-Output "5c SECRETARIA IMPORT : FALLO (dio $secImportStatus, esperado 403)" }

# --- Limpieza ---
$client.Dispose()
$clientSec.Dispose()
Remove-Item $tmpXlsx -ErrorAction SilentlyContinue
Remove-Item $tmpExport -ErrorAction SilentlyContinue
