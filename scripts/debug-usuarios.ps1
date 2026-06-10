$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmss"
$email = "m3d$ts@test.com"
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "M3d $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$token = $login.accessToken; if (-not $token) { $token = $login.access_token }
$h = @{ Authorization = "Bearer $token" }

$postRaw = Invoke-WebRequest -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec Uno"; email = "sec$ts@test.com"; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) -UseBasicParsing
Write-Output "POST STATUS: $($postRaw.StatusCode)"
Write-Output "POST BODY: $($postRaw.Content)"

$getRaw = Invoke-WebRequest -Uri "$base/usuarios" -Headers $h -UseBasicParsing
Write-Output "GET BODY: $($getRaw.Content)"
