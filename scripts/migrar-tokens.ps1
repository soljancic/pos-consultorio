# Migracion mecanica de clases Tailwind crudas -> tokens semanticos (dark mode ready)
# Orden importa: strings mas especificos primero.
$reemplazos = [ordered]@{
  'hover:bg-slate-100'   = 'hover:bg-muted'
  'hover:bg-slate-50'    = 'hover:bg-muted/60'
  'bg-slate-50'          = 'bg-muted/50'
  'bg-slate-100'         = 'bg-muted'
  'bg-white'             = 'bg-card'
  'text-slate-800'       = 'text-foreground'
  'text-slate-700'       = 'text-foreground'
  'text-slate-600'       = 'text-muted-foreground'
  'text-slate-500'       = 'text-muted-foreground'
  'hover:text-slate-700' = 'hover:text-foreground'
  'text-slate-400'       = 'text-muted-foreground/70'
  'border-slate-300'     = 'border-input'
  'hover:bg-blue-700'    = 'hover:bg-primary/90'
  'bg-blue-600'          = 'bg-primary'
  'hover:bg-blue-50'     = 'hover:bg-primary/10'
  'bg-blue-50'           = 'bg-primary/10'
  'text-blue-600'        = 'text-primary'
  'text-blue-700'        = 'text-primary'
  'border-blue-600'      = 'border-primary'
  'border-blue-400'      = 'border-primary/60'
  'focus:ring-blue-500'  = 'focus:ring-ring'
  'text-red-600'         = 'text-destructive'
  'bg-red-50'            = 'bg-destructive/10'
  'border-red-200'       = 'border-destructive/30'
  'hover:bg-green-100'   = 'hover:bg-accent/20'
  'bg-green-50'          = 'bg-accent/10'
  'text-green-600'       = 'text-accent'
  'text-green-700'       = 'text-accent'
  'hover:bg-green-700'   = 'hover:bg-accent/90'
  'bg-green-600'         = 'bg-accent'
  'hover:bg-violet-50'   = 'hover:bg-violet-500/10'
  'bg-violet-50/50'      = 'bg-violet-500/5'
}

$archivos = Get-ChildItem "$PSScriptRoot\..\apps\web\src\features" -Recurse -Filter *.tsx
$totalCambios = 0
foreach ($f in $archivos) {
  $contenido = [System.IO.File]::ReadAllText($f.FullName)
  $original = $contenido
  foreach ($k in $reemplazos.Keys) {
    $contenido = $contenido.Replace($k, $reemplazos[$k])
  }
  if ($contenido -ne $original) {
    [System.IO.File]::WriteAllText($f.FullName, $contenido)
    $totalCambios++
    Write-Output "migrado: $($f.Name)"
  }
}
Write-Output "Archivos modificados: $totalCambios"
