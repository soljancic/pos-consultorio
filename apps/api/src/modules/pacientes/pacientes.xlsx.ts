import * as ExcelJS from 'exceljs'

export const COLUMNS = [
  { key: 'nombre', header: 'nombre' },
  { key: 'apellido', header: 'apellido' },
  { key: 'dni', header: 'dni' },
  { key: 'telefono', header: 'telefono' },
  { key: 'pais', header: 'pais' },
  { key: 'email', header: 'email' },
  { key: 'sexo', header: 'sexo' },
  { key: 'fechaNacimiento', header: 'fechaNacimiento' },
  { key: 'direccion', header: 'direccion' },
  { key: 'notas', header: 'notas' },
] as const

export type FilaPaciente = Partial<Record<(typeof COLUMNS)[number]['key'], string>>

function celdaToStr(v: ExcelJS.CellValue): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'object' && 'text' in (v as object))
    return String((v as { text: string }).text).trim() || undefined
  if (v instanceof Date) return v.toISOString().slice(0, 10) // YYYY-MM-DD
  const s = String(v).trim()
  return s || undefined
}

export async function parseWorkbook(buffer: Buffer): Promise<FilaPaciente[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  // map header label -> column index
  const headerRow = ws.getRow(1)
  const idx: Record<string, number> = {}
  headerRow.eachCell((cell, col) => {
    const h = celdaToStr(cell.value)?.toLowerCase()
    if (h) idx[h] = col
  })

  const filas: FilaPaciente[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const fila: FilaPaciente = {}
    let vacia = true
    for (const c of COLUMNS) {
      const col = idx[c.header.toLowerCase()]
      if (!col) continue
      const val = celdaToStr(row.getCell(col).value)
      if (val !== undefined) {
        ;(fila as Record<string, string>)[c.key] = val
        vacia = false
      }
    }
    if (!vacia) filas.push(fila)
  }
  return filas
}

export async function buildWorkbook(rows: FilaPaciente[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Pacientes')
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 18 }))
  for (const row of rows) ws.addRow(row)
  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>
}

export async function buildSample(): Promise<Buffer> {
  return buildWorkbook([
    {
      nombre: 'Juan',
      apellido: 'Perez',
      dni: '12345678',
      telefono: '70011223',
      pais: 'BO',
      email: 'juan@ejemplo.com',
      sexo: 'M',
      fechaNacimiento: '1990-05-01',
      direccion: 'Av. Siempre Viva 123',
      notas: '',
    },
  ])
}
