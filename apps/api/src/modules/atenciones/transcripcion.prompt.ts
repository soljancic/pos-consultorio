export const MODELO_TRANSCRIPCION_DEFAULT = 'claude-opus-5'

/**
 * Modelo a usar para transcribir. Configurable por env para poder bajar a
 * claude-sonnet-5 (mas barato) sin un deploy de codigo.
 */
export function modeloTranscripcion(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  const valor = env.TRANSCRIPCION_MODEL?.trim()
  return valor ? valor : MODELO_TRANSCRIPCION_DEFAULT
}

/** PNG y JPEG por magic number. No confiamos en el mimetype que manda el cliente. */
export function mediaTypeDeImagen(buffer: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  return null
}

export const PROMPT_TRANSCRIPCION = [
  'Esta imagen es una hoja de notas clinicas escrita a mano por un psicologo, en espanol.',
  'Transcribi el texto tal como esta escrito, respetando los saltos de linea, las vinetas y la separacion en parrafos.',
  'No corrijas la redaccion, no resumas y no completes lo que falte.',
  'Si una palabra no se entiende, escribi [ilegible] en su lugar.',
  'Si hay dibujos, esquemas o diagramas, describilos brevemente entre corchetes, por ejemplo [esquema familiar].',
  'Tu respuesta debe ser solo la transcripcion, sin introduccion, comentarios ni conclusiones.',
].join(' ')
