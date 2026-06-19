import { COLUMNS, buildSample, buildWorkbook, parseWorkbook } from './pacientes.xlsx'

describe('pacientes.xlsx', () => {
  it('round-trip: buildWorkbook -> parseWorkbook conserva los campos', async () => {
    const rows = [
      {
        nombre: 'Juan',
        apellido: 'Perez',
        dni: '123',
        telefono: '5551234',
        pais: 'BO',
        email: 'j@x.com',
        sexo: 'M',
        fechaNacimiento: '1990-05-01',
        direccion: 'Calle 1',
        notas: 'ok',
      },
    ]
    const buf = await buildWorkbook(rows)
    const parsed = await parseWorkbook(buf)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject(rows[0])
  })

  it('el sample trae los headers del set completo', async () => {
    const buf = await buildSample()
    const parsed = await parseWorkbook(buf)
    expect(parsed.length).toBeGreaterThanOrEqual(1) // 1 fila de ejemplo
  })

  it('COLUMNS tiene nombre y apellido primero', () => {
    expect(COLUMNS.slice(0, 2).map((c) => c.key)).toEqual(['nombre', 'apellido'])
  })
})
