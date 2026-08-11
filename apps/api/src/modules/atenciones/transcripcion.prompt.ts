export const MODELO_TRANSCRIPCION_DEFAULT = 'gpt-5.6-luna'

/**
 * Modelo a usar para transcribir. Configurable por env para poder cambiarlo
 * sin un deploy de codigo. Sea cual sea el que se ponga, tiene que aceptar
 * imagenes de entrada: aca se le manda una foto de la hoja, no texto.
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
  | { ok: false; motivo: 'refusal' | 'max_tokens' | 'incompleto' | 'vacio' }

/** Lo que hay que mirar de la respuesta para saber si sirve. */
export interface SenalesRespuesta {
  /** `status` de la respuesta: solo 'completed' es una respuesta entera. */
  estado: string | null | undefined
  /** `incomplete_details.reason` cuando el modelo no llego al final. */
  razonIncompleta: string | null | undefined
  /** Si la salida trae una parte de tipo 'refusal' (el modelo declino). */
  huboRechazo: boolean
  /** Texto agregado de la salida. */
  texto: string
}

/**
 * Decide si la respuesta del modelo es una transcripcion util antes de
 * persistir nada. Puro (no toca el SDK ni la BD) para poder probarlo sin
 * mocks, ver transcripcion.prompt.spec.ts.
 *
 * Nada de esto se guarda como si fuera una transcripcion completa: media
 * transcripcion presentada como entera engaña al doctor, que es justo el
 * error que no puede cometer una historia clinica. Por eso los motivos de
 * descarte tienen prioridad sobre "vacio" -- un corte puede dejar el texto
 * en blanco, y el motivo real es el corte, no la falta de texto.
 *
 * `max_output_tokens` es un tope conjunto de razonamiento + texto visible:
 * con hojas muy densas el modelo se puede quedar sin presupuesto a mitad de
 * frase. `content_filter` es un rechazo por otro camino, asi que cae en el
 * mismo motivo que un 'refusal' explicito.
 */
/**
 * Limpieza deterministica de lo que devuelve el modelo.
 *
 * NO junta renglones: decidir si un salto significa algo o si es el borde de
 * la hoja exige estar viendo la hoja, asi que eso vive en el prompt y no aca.
 * Esto solo saca lo que sobra sin ninguna ambiguedad.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n') // saltos al estilo Windows
    .replace(/[ \t]+$/gm, '') // espacios colgando al final del renglon
    .replace(/\n{3,}/g, '\n\n') // rachas de lineas en blanco -> una sola
    .trim()
}

export function resultadoTranscripcion(senales: SenalesRespuesta): ResultadoTranscripcion {
  const { estado, razonIncompleta, huboRechazo, texto } = senales

  if (huboRechazo || razonIncompleta === 'content_filter') return { ok: false, motivo: 'refusal' }
  if (razonIncompleta === 'max_output_tokens') return { ok: false, motivo: 'max_tokens' }
  // Cualquier estado que no sea 'completed' (failed, cancelled, incomplete por
  // un motivo que no conocemos) es una respuesta que no termino.
  if (estado !== 'completed') return { ok: false, motivo: 'incompleto' }

  const limpio = normalizarTexto(texto)
  if (!limpio) return { ok: false, motivo: 'vacio' }
  return { ok: true, texto: limpio }
}

export const PROMPT_TRANSCRIPCION = [
  'Esta imagen es una hoja de notas clinicas escrita a mano por un psicologo, en espanol.',
  'Transcribi el texto tal como esta escrito.',
  // El salto de linea es el punto donde mas se equivoca: en una hoja escrita a
  // mano el renglon se corta porque se acabo el papel, no porque el que
  // escribia quisiera cortar ahi. Pedir "respetar los saltos de linea" a secas
  // devolvia una linea por renglon y partia las frases al medio.
  'Un renglon que se corta porque se termino el ancho de la hoja NO es un salto de linea: unilo con el renglon siguiente en un solo parrafo continuo, con un espacio en el medio, y no cortes palabras.',
  'Usa un salto de linea solo donde el que escribio lo quiso: entre parrafos, entre items de una lista o vinetas, en titulos, fechas y firmas.',
  'No agregues lineas en blanco de mas: como maximo una linea en blanco entre parrafos.',
  'No corrijas la redaccion, no resumas y no completes lo que falte.',
  'Si una palabra no se entiende, escribi [ilegible] en su lugar.',
  'Si hay dibujos, esquemas o diagramas, describilos brevemente entre corchetes, por ejemplo [esquema familiar].',
  'Tu respuesta debe ser solo la transcripcion, sin introduccion, comentarios ni conclusiones.',
].join(' ')
