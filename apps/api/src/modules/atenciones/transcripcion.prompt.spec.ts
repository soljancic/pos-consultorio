import { mediaTypeDeImagen, modeloTranscripcion, PROMPT_TRANSCRIPCION } from './transcripcion.prompt'

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
