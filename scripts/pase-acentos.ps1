# Pase de acentos del copy del frontend (item 45). Idempotente.
# Las tildes se construyen por codigo Unicode para ser inmunes al encoding
# con que PowerShell 5.1 lea este archivo (sin BOM asume ANSI).
# Solo palabras/frases de copy que NO colisionan con identificadores ni rutas.
param([string]$Raiz = "apps/web")

$a = [char]0x00E1; $e = [char]0x00E9; $i = [char]0x00ED; $o = [char]0x00F3; $u = [char]0x00FA; $enie = [char]0x00F1

# Palabras con borde de palabra (case-sensitive). Capitalizadas: no matchean
# identificadores camelCase (AtencionModal, diasSemana, etc.) por el \b.
$dict = @(
  @('Configuracion', "Configuraci$($o)n"),
  @('Catalogo', "Cat$($a)logo"),
  @('Atencion', "Atenci$($o)n"),
  @('Telefono', "Tel$($e)fono"),
  @('Direccion', "Direcci$($o)n"),
  @('Descripcion', "Descripci$($o)n"),
  @('Duracion', "Duraci$($o)n"),
  @('Categoria', "Categor$($i)a"),
  @('Numero', "N$($u)mero"),
  @('Capacitacion', "Capacitaci$($o)n"),
  @('Reunion', "Reuni$($o)n"),
  @('Dia', "D$($i)a"),
  @('Mas', "M$($a)s"),
  @('Proximo', "Pr$($o)ximo"),
  @('Proximas', "Pr$($o)ximas"),
  @('Ultima', "$([char]0x00DA)ltima"),
  @('Ultimo', "$([char]0x00DA)ltimo"),
  @('Llego', "Lleg$($o)"),
  @('Creacion', "Creaci$($o)n"),
  @('Edicion', "Edici$($o)n"),
  @('anos', "a$($enie)os"),
  @('asistio', "asisti$($o)"),
  @('edicion', "edici$($o)n")
)
# Frases literales especificas (verificadas contra el codigo: ninguna pisa
# identificadores; 'atencion' suelto NO se toca porque es variable/campo)
$frases = @(
  @(' del dia', " del d$($i)a"),
  @(' el dia ', " el d$($i)a "),
  @('En atencion', "En atenci$($o)n"),
  @('Ver atencion', "Ver atenci$($o)n"),
  @('ver atencion', "ver atenci$($o)n"),
  @('de atencion', "de atenci$($o)n"),
  @('la atencion', "la atenci$($o)n"),
  @('30 dias', "30 d$($i)as"),
  @('Pendiente revision', "Pendiente revisi$($o)n"),
  @('de revision', "de revisi$($o)n"),
  @('por categoria', "por categor$($i)a"),
  @('por accion', "por acci$($o)n")
)

$files = Get-ChildItem "$Raiz/src" -Recurse -Include *.tsx,*.ts
# OJO PS 5.1: -Include sin -Recurse necesita wildcard en el path
$files += Get-ChildItem "$Raiz/e2e/*.ts"
$cambiados = 0
foreach ($f in $files) {
  $raw = [IO.File]::ReadAllText($f.FullName)
  $orig = $raw
  foreach ($par in $dict) {
    $patron = '\b' + [regex]::Escape($par[0]) + '\b'
    $raw = [regex]::Replace($raw, $patron, $par[1])
  }
  foreach ($par in $frases) { $raw = $raw.Replace($par[0], $par[1]) }
  if ($raw -ne $orig) {
    [IO.File]::WriteAllText($f.FullName, $raw, (New-Object System.Text.UTF8Encoding $false))
    $cambiados++
  }
}
Write-Output "archivos modificados: $cambiados"
