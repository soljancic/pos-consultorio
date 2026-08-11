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

export type ResultadoTranscripcion =
  | { ok: true; texto: string }
  | { ok: false; motivo: 'refusal' | 'max_tokens' | 'vacio' }

/**
 * Decide si la respuesta del modelo es una transcripcion util antes de
 * persistir nada. Puro (no toca el SDK ni la BD) para poder probarlo sin
 * mocks, ver transcripcion.prompt.spec.ts.
 *
 * `max_tokens` es un tope conjunto de "thinking" + texto de respuesta: con
 * hojas muy densas el modelo se puede quedar sin presupuesto a mitad de
 * frase. Guardar eso como si fuera una transcripcion completa engaña al
 * doctor, asi que se descarta aunque venga texto parcial (motivo tiene
 * prioridad sobre "vacio").
 */
export function resultadoTranscripcion(
  stopReason: string | null,
  texto: string,
): ResultadoTranscripcion {
  if (stopReason === 'refusal') return { ok: false, motivo: 'refusal' }
  if (stopReason === 'max_tokens') return { ok: false, motivo: 'max_tokens' }
  const limpio = texto.trim()
  if (!limpio) return { ok: false, motivo: 'vacio' }
  return { ok: true, texto: limpio }
}

export const PROMPT_TRANSCRIPCION = [
  'Esta imagen es una hoja de notas clinicas escrita a mano por un psicologo, en espanol.',
  'Transcribi el texto tal como esta escrito, respetando los saltos de linea, las vinetas y la separacion en parrafos.',
  'No corrijas la redaccion, no resumas y no completes lo que falte.',
  'Si una palabra no se entiende, escribi [ilegible] en su lugar.',
  'Si hay dibujos, esquemas o diagramas, describilos brevemente entre corchetes, por ejemplo [esquema familiar].',
  'Tu respuesta debe ser solo la transcripcion, sin introduccion, comentarios ni conclusiones.',
].join(' ')
