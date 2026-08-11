import { mediaTypeDeImagen, modeloTranscripcion, PROMPT_TRANSCRIPCION, resultadoTranscripcion } from './transcripcion.prompt'

describe('modeloTranscripcion', () => {
  it('usa gpt-5.6-luna por defecto', () => {
    expect(modeloTranscripcion({})).toBe('gpt-5.6-luna')
  })

  it('respeta TRANSCRIPCION_MODEL cuando esta seteado', () => {
    expect(modeloTranscripcion({ TRANSCRIPCION_MODEL: 'gpt-5.6' })).toBe('gpt-5.6')
  })

  it('ignora un valor vacio o solo espacios', () => {
    expect(modeloTranscripcion({ TRANSCRIPCION_MODEL: '   ' })).toBe('gpt-5.6-luna')
  })
})

describe('mediaTypeDeImagen', () => {
  it('reconoce PNG por su magic number', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    expect(mediaTypeDeImagen(png)).toBe('image/png')
  })

  it('reconoce JPEG por su magic number', () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
    expect(mediaTypeDeImagen(jpg)).toBe('image/jpeg')
  })

  it('devuelve null para cualquier otra cosa', () => {
    expect(mediaTypeDeImagen(Buffer.from('no soy una imagen'))).toBeNull()
    expect(mediaTypeDeImagen(Buffer.alloc(0))).toBeNull()
  })
})

describe('PROMPT_TRANSCRIPCION', () => {
  it('pide solo la transcripcion, sin comentarios del modelo', () => {
    expect(PROMPT_TRANSCRIPCION).toMatch(/solo la transcripcion|unicamente la transcripcion/i)
  })

  it('marca lo ilegible con [ilegible]', () => {
    expect(PROMPT_TRANSCRIPCION).toContain('[ilegible]')
  })
})

describe('resultadoTranscripcion', () => {
  /** Respuesta entera y sana, salvo lo que cada caso cambie. */
  const sana = {
    estado: 'completed',
    razonIncompleta: null,
    huboRechazo: false,
    texto: 'Paciente refiere...',
  }

  it('es ok con el texto recortado cuando la respuesta termina y hay texto', () => {
    expect(resultadoTranscripcion({ ...sana, texto: '  Paciente refiere...  ' })).toEqual({
      ok: true,
      texto: 'Paciente refiere...',
    })
  })

  it('no es ok cuando la salida trae una parte de rechazo', () => {
    expect(resultadoTranscripcion({ ...sana, huboRechazo: true, texto: '' })).toEqual({
      ok: false,
      motivo: 'refusal',
    })
  })

  it('trata content_filter como un rechazo', () => {
    expect(
      resultadoTranscripcion({ ...sana, estado: 'incomplete', razonIncompleta: 'content_filter' }),
    ).toEqual({ ok: false, motivo: 'refusal' })
  })

  it('no es ok cuando se corta por max_output_tokens, aunque haya texto parcial', () => {
    expect(
      resultadoTranscripcion({
        ...sana,
        estado: 'incomplete',
        razonIncompleta: 'max_output_tokens',
        texto: 'Paciente refiere dolor de cab',
      }),
    ).toEqual({ ok: false, motivo: 'max_tokens' })
  })

  it('no es ok cuando la respuesta no llego a completed, aunque traiga texto', () => {
    expect(resultadoTranscripcion({ ...sana, estado: 'failed' })).toEqual({
      ok: false,
      motivo: 'incompleto',
    })
    expect(resultadoTranscripcion({ ...sana, estado: null })).toEqual({
      ok: false,
      motivo: 'incompleto',
    })
  })

  it('no es ok cuando el texto queda vacio tras el trim', () => {
    expect(resultadoTranscripcion({ ...sana, texto: '   ' })).toEqual({ ok: false, motivo: 'vacio' })
    expect(resultadoTranscripcion({ ...sana, texto: '' })).toEqual({ ok: false, motivo: 'vacio' })
  })

  it('prioriza el motivo del corte sobre vacio cuando el corte dejo el texto en blanco', () => {
    expect(
      resultadoTranscripcion({
        ...sana,
        estado: 'incomplete',
        razonIncompleta: 'max_output_tokens',
        texto: '',
      }),
    ).toEqual({ ok: false, motivo: 'max_tokens' })
  })
})
