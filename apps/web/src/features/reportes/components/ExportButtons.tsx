import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Printer } from 'lucide-react'
import { btnOutlineUI } from '../../../lib/ui'
import { cn } from '../../../lib/utils'

interface Props {
  filename: string
  // Carga el dataset COMPLETO (sin paginar) y lo mapea a headers/filas de Excel.
  loadAll: () => Promise<{ headers: string[]; rows: Array<Array<string | number>> }>
}

export function ExportButtons({ filename, loadAll }: Props) {
  const [busy, setBusy] = useState(false)
  async function exportarExcel() {
    setBusy(true)
    try {
      const { headers, rows } = await loadAll()
      const hoja = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, hoja, 'Reporte')
      XLSX.writeFile(libro, `${filename}.xlsx`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={exportarExcel} disabled={busy} className={cn(btnOutlineUI, 'disabled:opacity-60')}>
        <Download className="h-4 w-4" aria-hidden="true" /> {busy ? 'Generando...' : 'Excel'}
      </button>
      <button onClick={() => window.print()} className={btnOutlineUI}>
        <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir
      </button>
    </div>
  )
}
