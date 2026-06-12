import { EstadoCita, TRANSICIONES_VALIDAS, transicionValida } from '@pos/types'

// La maquina de estados es la regla de negocio mas critica del sistema:
// estos tests fijan el contrato para que nadie la afloje sin darse cuenta.
describe('maquina de estados de citas', () => {
  it('flujo feliz completo: PENDIENTE -> ... -> COBRADO', () => {
    const flujo = [
      [EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA],
      [EstadoCita.CONFIRMADA, EstadoCita.LLEGO],
      [EstadoCita.LLEGO, EstadoCita.EN_ATENCION],
      [EstadoCita.EN_ATENCION, EstadoCita.ATENDIDA],
      [EstadoCita.ATENDIDA, EstadoCita.COBRADO],
    ] as const
    for (const [desde, hacia] of flujo) {
      expect(transicionValida(desde, hacia)).toBe(true)
    }
  })

  it('flujo con deuda: ATENDIDA -> CON_DEUDA -> COBRADO', () => {
    expect(transicionValida(EstadoCita.ATENDIDA, EstadoCita.CON_DEUDA)).toBe(true)
    expect(transicionValida(EstadoCita.CON_DEUDA, EstadoCita.COBRADO)).toBe(true)
  })

  it('COBRADO es terminal: no sale a ningun estado', () => {
    for (const hacia of Object.values(EstadoCita)) {
      expect(transicionValida(EstadoCita.COBRADO, hacia)).toBe(false)
    }
  })

  it('no se puede saltar el flujo (PENDIENTE no va directo a ATENDIDA ni COBRADO)', () => {
    expect(transicionValida(EstadoCita.PENDIENTE, EstadoCita.ATENDIDA)).toBe(false)
    expect(transicionValida(EstadoCita.PENDIENTE, EstadoCita.COBRADO)).toBe(false)
    expect(transicionValida(EstadoCita.PENDIENTE, EstadoCita.EN_ATENCION)).toBe(false)
  })

  it('no se puede retroceder (ATENDIDA no vuelve a PENDIENTE)', () => {
    expect(transicionValida(EstadoCita.ATENDIDA, EstadoCita.PENDIENTE)).toBe(false)
    expect(transicionValida(EstadoCita.EN_ATENCION, EstadoCita.LLEGO)).toBe(false)
  })

  it('ATENDIDA se alcanza solo desde EN_ATENCION (garantiza el incremento unico de deudaTotal)', () => {
    const origenes = Object.values(EstadoCita).filter((desde) =>
      TRANSICIONES_VALIDAS[desde].includes(EstadoCita.ATENDIDA),
    )
    expect(origenes).toEqual([EstadoCita.EN_ATENCION])
  })

  it('SOLICITADA (portal) solo se acepta como PENDIENTE o se cancela', () => {
    expect(transicionValida(EstadoCita.SOLICITADA, EstadoCita.PENDIENTE)).toBe(true)
    expect(transicionValida(EstadoCita.SOLICITADA, EstadoCita.CANCELADA)).toBe(true)
    expect(transicionValida(EstadoCita.SOLICITADA, EstadoCita.CONFIRMADA)).toBe(false)
    expect(transicionValida(EstadoCita.SOLICITADA, EstadoCita.NO_ASISTIO)).toBe(false)
  })

  it('ningun estado vuelve a SOLICITADA (solo nace asi desde el portal)', () => {
    for (const desde of Object.values(EstadoCita)) {
      expect(transicionValida(desde, EstadoCita.SOLICITADA)).toBe(false)
    }
  })

  it('cancelada y no-asistio pueden reabrirse como PENDIENTE', () => {
    expect(transicionValida(EstadoCita.CANCELADA, EstadoCita.PENDIENTE)).toBe(true)
    expect(transicionValida(EstadoCita.NO_ASISTIO, EstadoCita.PENDIENTE)).toBe(true)
  })

  it('PENDIENTE puede marcarse NO_ASISTIO directo (cron E3 y accion manual)', () => {
    expect(transicionValida(EstadoCita.PENDIENTE, EstadoCita.NO_ASISTIO)).toBe(true)
  })

  it('estados desconocidos no rompen (acepta strings sucios)', () => {
    expect(transicionValida('CUALQUIER_COSA', 'COBRADO')).toBe(false)
    expect(transicionValida('', '')).toBe(false)
  })

  it('todo estado del enum tiene transiciones definidas (mapa completo)', () => {
    for (const estado of Object.values(EstadoCita)) {
      expect(TRANSICIONES_VALIDAS[estado]).toBeDefined()
    }
  })
})
