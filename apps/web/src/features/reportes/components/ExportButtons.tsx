import { useState } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Download, Printer, FileText } from 'lucide-react'
import { btnOutlineUI } from '../../../lib/ui'
import { cn } from '../../../lib/utils'
import { toast } from '../../../stores/toast.store'

interface Props {
  filename: string
  // Carga el dataset COMPLETO (sin paginar) y lo mapea a headers/filas de Excel.
  loadAll: () => Promise<{ headers: string[]; rows: Array<Array<string | number>> }>
}

export function ExportButtons({ filename, loadAll }: Props) {
  const [busyExcel, setBusyExcel] = useState(false)
  const [busyPdf, setBusyPdf] = useState(false)

  async function exportarExcel() {
    setBusyExcel(true)
    try {
      const { headers, rows } = await loadAll()
      const hoja = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, hoja, 'Reporte')
      XLSX.writeFile(libro, `${filename}.xlsx`)
    } catch (err) {
      toast.fromError(err, 'No se pudo generar el Excel. Probá de nuevo.')
    } finally {
      setBusyExcel(false)
    }
  }

  async function exportarPdf() {
    setBusyPdf(true)
    try {
      const { headers, rows } = await loadAll()
      const landscape = headers.length > 5
      const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
      doc.setFontSize(12)
      doc.text(filename, 14, 14)
      autoTable(doc, {
        head: [headers],
        body: rows.map((r) => r.map((v) => String(v))),
        startY: 20,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [55, 65, 81] },
      })
      doc.save(`${filename}.pdf`)
    } catch (err) {
      toast.fromError(err, 'No se pudo generar el PDF. Probá de nuevo.')
    } finally {
      setBusyPdf(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={exportarExcel} disabled={busyExcel} className={cn(btnOutlineUI, 'disabled:opacity-60')}>
        <Download className="h-4 w-4" aria-hidden="true" /> {busyExcel ? 'Generando...' : 'Excel'}
      </button>
      <button onClick={exportarPdf} disabled={busyPdf} className={cn(btnOutlineUI, 'disabled:opacity-60')}>
        <FileText className="h-4 w-4" aria-hidden="true" /> {busyPdf ? 'Generando...' : 'PDF'}
      </button>
      {/* Imprimir: oculto en celular (imprimir desde el telefono no es util y
          libera espacio para que Excel/PDF entren en la 1ra fila del header). */}
      <button onClick={() => window.print()} className={cn(btnOutlineUI, 'max-sm:hidden')}>
        <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir
      </button>
    </div>
  )
}
