# Gate E2.5b: portal publico de reservas (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "e25b$ts@test.com"
# Manana: los slots de hoy a horas fijas se filtrarian como pasados (pulido E2.5b)
$hoy = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$ayer = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
$slug = "portal$ts"

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

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "E25B $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Portal" } | ConvertTo-Json)
Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $doc.id; fecha = $hoy; horaInicio = "09:00"; horaFin = "12:00" } | ConvertTo-Json) | Out-Null

# 1) Portal desactivado -> 404 (sin enumeracion)
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug" } 404 "1 PORTAL DESACTIVADO"

# 2) Activar con slug y leer info SIN token
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ slug = $slug; portalActivo = $true } | ConvertTo-Json) | Out-Null
$info = Invoke-RestMethod -Uri "$base/public/$slug"
Write-Output "2 INFO PUBLICA: consultorio=$($info.consultorio.nombre -ne $null) doctores=$(@($info.doctores).Count) (esp 1) servicios=$(@($info.servicios).Count) (esp 1)"

# 3) Slots publicos
$slots = Invoke-RestMethod -Uri "$base/public/$slug/slots?doctorId=$($doc.id)&servicioId=$($srv.id)&fecha=$hoy"
Write-Output "3 SLOTS: count=$(@($slots.slots).Count) (esp 6) primero=$($slots.slots[0]) (esp 09:00)"

# 3b) Calendario Calendly: dias del mes con al menos un horario libre
$mes = (Get-Date).AddDays(1).ToString("yyyy-MM")
$dias = Invoke-RestMethod -Uri "$base/public/$slug/dias?doctorId=$($doc.id)&servicioId=$($srv.id)&mes=$mes"
Write-Output "3b DIAS DEL MES: contiene dia sembrado=$(@($dias.dias) -contains $hoy) (esp True) total=$(@($dias.dias).Count)"

# 4) Reservar 09:30 -> paciente nuevo (con pais) + cita SOLICITADA origen PORTAL
$res = Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "09:30"; nombre = "Pia"; apellido = "Portal"; telefono = "+59170000001"; pais = "AR"; email = "pia@inicial.bo"; notas = "Vengo por dolor de muela" } | ConvertTo-Json)
Write-Output "4 RESERVA: reservada=$($res.reservada) hora=$($res.hora) (esp 09:30) doctor=$($res.doctor)"
$citas = Invoke-RestMethod -Uri "$base/citas?fecha=$hoy" -Headers $h
$citaPortal = @($citas) | Where-Object { $_.origen -eq 'PORTAL' }
$pacs = Invoke-RestMethod -Uri "$base/pacientes?search=Portal" -Headers $h
Write-Output "   cita origen PORTAL=$(@($citaPortal).Count) (esp 1) estado=$($citaPortal[0].estado) (esp SOLICITADA) paciente creado=$(@($pacs).Count) (esp 1) pais=$($pacs[0].pais) (esp AR)"
Write-Output "   notas=$($citaPortal[0].notasSecretaria) (esp Reserva del portal: Vengo por dolor de muela)"

# 4b) La solicitud NO se confirma directo; la secretaria la acepta -> PENDIENTE
Esperar-Error { Invoke-RestMethod -Uri "$base/citas/$($citaPortal[0].id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "CONFIRMADA" } | ConvertTo-Json) } 400 "4b SOLICITADA NO CONFIRMA DIRECTO"
$aceptada = Invoke-RestMethod -Uri "$base/citas/$($citaPortal[0].id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = "PENDIENTE" } | ConvertTo-Json)
Write-Output "4c ACEPTADA: estado=$($aceptada.estado) (esp PENDIENTE)"

# 5) Mismo telefono reserva de nuevo -> NO duplica paciente
Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "10:30"; nombre = "Pia"; apellido = "Portal"; telefono = "+59170000001"; email = "pia@inicial.bo" } | ConvertTo-Json) | Out-Null
$pacs2 = Invoke-RestMethod -Uri "$base/pacientes?search=Portal" -Headers $h
Write-Output "5 MATCH TELEFONO: pacientes=$(@($pacs2).Count) (esp 1, sin duplicar)"

# 5b) Link precargado: el token opaco resuelve el prefill publico
$tok = (Invoke-RestMethod -Uri "$base/pacientes/$($pacs2[0].id)/portal-token" -Headers $h).token
$pre = Invoke-RestMethod -Uri "$base/public/$slug/prefill/$tok"
Write-Output "5b PREFILL TOKEN: nombre=$($pre.nombre) (esp Pia) telefono=$($pre.telefono) (esp +59170000001) pais=$($pre.pais) (esp AR)"
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug/prefill/token-falso" } 404 "5c TOKEN FALSO"

# 5d) Reserva con token, OTRO telefono/email y check "actualizar datos" ->
# matchea por token, no duplica, y el kardex se sincroniza
Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "11:00"; nombre = "Pia"; apellido = "Portal"; telefono = "+59179999999"; email = "pia@portal.bo"; token = $tok; actualizarDatos = $true } | ConvertTo-Json) | Out-Null
$pacs3 = Invoke-RestMethod -Uri "$base/pacientes?search=Portal" -Headers $h
Write-Output "5d RESERVA CON TOKEN: pacientes=$(@($pacs3).Count) (esp 1, matchea por token)"
Write-Output "5e KARDEX SINCRONIZADO: telefono=$($pacs3[0].telefono) (esp +59179999999) email=$($pacs3[0].email) (esp pia@portal.bo)"

# 5f) Reserva con token y cambios pero SIN el check -> el kardex NO se toca
Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "09:00"; nombre = "Pia"; apellido = "Portal"; telefono = "+59170000777"; email = "otro@mail.bo"; token = $tok } | ConvertTo-Json) | Out-Null
$pacs4 = Invoke-RestMethod -Uri "$base/pacientes?search=Portal" -Headers $h
Write-Output "5f SIN CHECK NO PISA: telefono=$($pacs4[0].telefono) (esp +59179999999) email=$($pacs4[0].email) (esp pia@portal.bo)"

# 6) Slot ocupado -> 409; consultorioId forjado -> 400 (whitelist)
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "09:30"; nombre = "X"; apellido = "Y"; telefono = "+59170000002"; email = "x@y.bo" } | ConvertTo-Json) } 409 "6 SLOT OCUPADO"
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ consultorioId = 1; doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "11:00"; nombre = "X"; apellido = "Y"; telefono = "+59170000003"; email = "x@y.bo" } | ConvertTo-Json) } 400 "7 CONSULTORIOID FORJADO"
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $hoy; hora = "11:30"; nombre = "X"; apellido = "Y"; telefono = "+59170000004" } | ConvertTo-Json) } 400 "7b EMAIL OBLIGATORIO"

# 7c) QR publico: 404 sin QR cargado; con qrUrl seteada devuelve los datos
Esperar-Error { Invoke-RestMethod -Uri "$base/public/$slug/qr" } 404 "7c QR SIN CARGAR"
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ qrUrl = "https://res.cloudinary.com/demo/image/upload/sample.jpg" } | ConvertTo-Json) | Out-Null
$qr = Invoke-RestMethod -Uri "$base/public/$slug/qr"
Write-Output "7d QR PUBLICO: consultorio=$($qr.consultorio) tieneUrl=$([bool]$qr.qrUrl) (esp True)"

# 8) Fecha pasada -> sin slots (filtro de slots pasados)
$slotsAyer = Invoke-RestMethod -Uri "$base/public/$slug/slots?doctorId=$($doc.id)&servicioId=$($srv.id)&fecha=$ayer"
Write-Output "8 SLOTS PASADOS: count=$(@($slotsAyer.slots).Count) (esp 0)"

# 9) Slug inexistente -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/public/no-existe-$ts" } 404 "9 SLUG INEXISTENTE"

# 9b) Calendario: doctor que no atiende el servicio -> sin dias
$srv2 = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Otro $ts"; duracionMin = 30; precioBase = 500 } | ConvertTo-Json)
# JSON manual: ConvertTo-Json colapsa arrays de 1 elemento (gotcha PS 5.1)
Invoke-RestMethod -Uri "$base/doctores/$($doc.id)/servicios" -Method Put -Headers $h -ContentType "application/json" -Body "{ ""servicioIds"": [$($srv2.id)] }" | Out-Null
$diasNo = Invoke-RestMethod -Uri "$base/public/$slug/dias?doctorId=$($doc.id)&servicioId=$($srv.id)&mes=$mes"
Write-Output "9b DIAS NO ATIENDE: count=$(@($diasNo.dias).Count) (esp 0)"
