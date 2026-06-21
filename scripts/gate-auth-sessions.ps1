# Gate: hardening de auth (2026-06-21) — sesiones con rotacion + deteccion de
# reuso + logout real en el server. Requiere la API corriendo en :3000 y el
# registro publico abierto (REGISTRO_ABIERTO != 'false', default dev). Crea su
# propio tenant via /auth/register. El refresh token viaja en cookie httpOnly:
# aca lo manejamos con WebSession (cookie jar) y replays manuales.
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$refreshUri = [System.Uri]"$base/auth/refresh"

function Get-RefreshCookie { param($sess)
  ($sess.Cookies.GetCookies($refreshUri) | Where-Object { $_.Name -eq 'refresh' } | Select-Object -First 1).Value
}
function New-SessionConCookie { param([string]$value)
  $s = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
  $s.Cookies.Add([System.Net.Cookie]::new('refresh', $value, '/api/v1/auth', 'localhost'))
  $s
}
function Esperar-Error { param([scriptblock]$block, [int]$code, [string]$label)
  try { & $block | Out-Null; Write-Output "FAIL ${label}: no dio error (esp $code)" }
  catch {
    $sc = $_.Exception.Response.StatusCode.value__
    if ($sc -eq $code) { Write-Output "OK ${label}: $code" } else { Write-Output "FAIL ${label}: $sc (esp $code)" }
  }
}

# 1) Registro: access en el body, refresh NO en el body (va en la cookie)
$email = "auth-sess-$(Get-Random)@test.com"
$reg = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" `
  -Body (@{ consultorioNombre = "AuthSess"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) `
  -SessionVariable sess
Write-Output "1 REGISTER: access=$($null -ne $reg.accessToken) refreshEnBody=$($null -ne $reg.refreshToken) cookie=$($null -ne (Get-RefreshCookie $sess)) (esp True False True)"
$cookie1 = Get-RefreshCookie $sess

# 2) El access token sirve para un endpoint protegido
$me = Invoke-RestMethod -Uri "$base/usuarios" -Headers @{ Authorization = "Bearer $($reg.accessToken)" }
Write-Output "2 PROTECTED: ok=$($null -ne $me) (esp True)"

# 3) Refresh rota la cookie y entrega un access nuevo
$r1 = Invoke-RestMethod -Uri "$base/auth/refresh" -Method Post -WebSession $sess
$cookie2 = Get-RefreshCookie $sess
Write-Output "3 REFRESH: access=$($null -ne $r1.accessToken) rotada=$($cookie1 -ne $cookie2) (esp True True)"

# 4) Reusar la cookie vieja (ya rotada) => 401
Esperar-Error { Invoke-RestMethod -Uri "$base/auth/refresh" -Method Post -WebSession (New-SessionConCookie $cookie1) } 401 "4 REUSO COOKIE VIEJA"

# 5) El reuso mata la familia entera: la cookie nueva (era valida) tambien cae
Esperar-Error { Invoke-RestMethod -Uri "$base/auth/refresh" -Method Post -WebSession (New-SessionConCookie $cookie2) } 401 "5 FAMILIA REVOCADA"

# 6) Re-login limpio: nueva familia, refresh ok
Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json) -SessionVariable sess2 | Out-Null
$r2 = Invoke-RestMethod -Uri "$base/auth/refresh" -Method Post -WebSession $sess2
Write-Output "6 RELOGIN+REFRESH: ok=$($null -ne $r2.accessToken) (esp True)"

# 7) Logout revoca la sesion en el server: el refresh posterior falla
Invoke-RestMethod -Uri "$base/auth/logout" -Method Post -WebSession $sess2 | Out-Null
Esperar-Error { Invoke-RestMethod -Uri "$base/auth/refresh" -Method Post -WebSession $sess2 } 401 "7 REFRESH POST-LOGOUT"

Write-Output "GATE auth-sessions DONE (revisar que no haya FAIL arriba)"
