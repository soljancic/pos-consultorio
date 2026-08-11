import { mediaTypeDeImagen, modeloTranscripcion, PROMPT_TRANSCRIPCION, resultadoTranscripcion } from './transcripcion.prompt'

describe('modeloTranscripcion', () => {
  it('usa claude-opus-5 por defecto', () => {
    expect(modeloTranscripcion({})).toBe('claude-opus-5')
  })

  it('respeta TRANSCRIPCION_MODEL cuando esta seteado', () => {
    expect(modeloTranscripcion({ TRANSCRIPCION_MODEL: 'claude-sonnet-5' })).toBe('claude-sonnet-5')
  })

  it('ignora un valor vacio o solo espacios', () => {
    expect(modeloTranscripcion({ TRANSCRIPCION_MODEL: '   ' })).toBe('claude-opus-5')
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
  it('es ok con el texto recortado cuando el modelo termina normalmente y hay texto', () => {
    expect(resultadoTranscripcion('end_turn', '  Paciente refiere...  ')).toEqual({
      ok: true,
      texto: 'Paciente refiere...',
    })
  })

  it('no es ok cuando el modelo rechaza la respuesta (stop_reason refusal)', () => {
    expect(resultadoTranscripcion('refusal', '')).toEqual({ ok: false, motivo: 'refusal' })
  })

  it('no es ok cuando se corta por max_tokens, aunque haya texto parcial', () => {
    expect(resultadoTranscripcion('max_tokens', 'Paciente refiere dolor de cab')).toEqual({
      ok: false,
      motivo: 'max_tokens',
    })
  })

  it('no es ok cuando el texto queda vacio tras el trim, con cualquier otro stop_reason', () => {
    expect(resultadoTranscripcion('end_turn', '   ')).toEqual({ ok: false, motivo: 'vacio' })
    expect(resultadoTranscripcion(null, '')).toEqual({ ok: false, motivo: 'vacio' })
  })

  it('prioriza max_tokens sobre vacio cuando el corte dejo el texto en blanco', () => {
    expect(resultadoTranscripcion('max_tokens', '')).toEqual({ ok: false, motivo: 'max_tokens' })
  })
})
