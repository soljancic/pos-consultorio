# Notas manuscritas — entrega

> Fecha: 2026-08-11 · Estado: IMPLEMENTADO, sin deployar.
> Spec: `docs/superpowers/specs/2026-08-10-notas-manuscritas-design.md`
> Plan: `docs/superpowers/plans/2026-08-10-notas-manuscritas.md`
> 36 commits en master, de `e269453` a `a54bf46`.

El psicologo escribe la nota de sesion a mano con Apple Pencil o lapiz Android,
en hojas A4 dentro del modal de Atencion, y puede pasarla a texto al campo
"Evolucion / notas". Escribir es solo tablet y celular; leer es en cualquier
dispositivo, incluida la PC.

**Cambio de comportamiento (2026-08-11).** Notas manuscritas, adjuntos y recetas
ya NO exigen guardar la atencion primero. La fila de `Atencion` se crea sola la
primera vez que se usa uno de los tres, con lo que haya en el formulario; abrir
el modal para mirar no crea nada. Consecuencia a tener presente: **"Cancelar" ya
no deshace todo** -- si se escribio una hoja, la atencion y la hoja quedan. Es la
regla que adjuntos y recetas ya seguian por su cuenta (se guardan por su propio
endpoint apenas se cargan); ahora la fila padre la sigue tambien.

---

## 1. Lo que falta hacer antes de usarlo

En orden. Los tres primeros son bloqueantes.

- [ ] **`pnpm install`** en la raiz. Dependencias nuevas: `perfect-freehand`
      (apps/web) y `openai` (apps/api).
- [ ] **Aplicar la migracion.** `add_hojas_manuscritas` es aditiva (solo
      `CREATE TABLE` + indices + FK); no toca ni borra nada existente.
- [ ] **`OPENAI_API_KEY`** en `apps/api/.env` y en las variables de Railway.
      Sin la key el modulo funciona igual: solo el boton "Transcribir a texto"
      queda deshabilitado, con una leyenda que explica por que.
      **Generar una key propia para el consultorio**, no reusar la de otro
      sistema: si hay que revocarla, no tiene que caerse nada mas con ella.
      Opcional: `TRANSCRIPCION_MODEL` para cambiar de modelo sin deploy. El que
      se ponga tiene que aceptar imagenes de entrada.

Y correr lo que el agente no pudo (necesitan la API levantada):

- [ ] `pwsh scripts/gate-manuscrito.ps1` — 12 casos. **El caso 11 es el que
      importa**: verifica que borrar una hoja no libere su numero de orden.
- [ ] `pwsh scripts/gate-e2m4-f2.ps1` — regresion; cambio la forma de la
      respuesta de la linea de tiempo.
- [ ] `cd apps/web && npx playwright test manuscrito` — 6 casos, **nunca
      ejecutados**. Necesita `LOGIN_RATE_LIMIT` alto en `apps/api/.env`.

---

## 2. Pruebas en hardware real

Nada de esto se valida en un emulador ni con un test. Ordenado por lo que se
rompe si falla.

**Pierde trabajo del doctor si falla:**

1. **Escribir un parrafo de cursiva en iPad con Scribble ENCENDIDO** y contar si
   se pierden trazos. Es el conflicto de plataforma documentado en el spec §4:
   iPadOS intercepta trazos que le parecen escritura, y no hay forma de que una
   PWA se desuscriba. Si se pierden, apagar Scribble (Ajustes → Apple Pencil →
   Scribble) y confirmar que deja de pasar. **La evidencia es un reporte de
   terceros, no documentacion de Apple, y nunca se reprodujo en tu hardware** —
   por eso el aviso in-app esta redactado en condicional.
2. **Cortar el WiFi a mitad de la nota**, seguir escribiendo, cerrar el editor y
   volver a abrir la hoja. Tiene que ofrecer recuperar el borrador.
3. **Escribir de corrido 30-40 segundos con red lenta** (throttle "Slow 3G") sin
   cambiar de hoja, y confirmar que el indicador nunca dice "Guardado" mientras
   falte un trazo en el servidor.
4. **Doble toque rapido en "+ Hoja"** y toques rapidos en las flechas: no debe
   dar error ni saltar a una hoja que no elegiste.

**Rompe la experiencia de escribir si falla:**

5. **Apoyar la palma** mientras se escribe con el lapiz: no debe dibujar. En un
   celular sin lapiz, el dedo SI debe dibujar.
6. **Apretar mas fuerte**: el trazo debe engrosar.
7. **Un trazo largo sin levantar el lapiz** (una linea entera de cursiva):
   mirar si hay tironeo. Si lo hay, avisame.
8. **Version de iPadOS del dispositivo.** Desde la 18.2 el navegador expone los
   eventos agrupados del lapiz; abajo de eso el trazo pierde algo de finura en
   movimientos rapidos, pero funciona.
9. **`pointercancel` a mitad de trazo**: deslizar desde el borde (Centro de
   Control en iOS, gesto de atras en Android) y confirmar que el trazo parcial
   se guarda y que el siguiente trazo funciona.

**Molesta pero no rompe:**

10. Transcribir una hoja real y comparar el texto con lo escrito.
11. Ver una hoja desde la historia clinica en la PC: la hoja tiene que ocupar
    la pantalla, no una tarjeta chica en el medio del monitor.
12. La barra de herramientas en tablet, en vertical y horizontal: sin scroll
    horizontal, todo al alcance del pulgar.

---

## 3. Deuda conocida, ya triada

Nada de esto bloquea el uso.

**Vale la pena arreglarlo cuando toques el archivo:**

- `LienzoManuscrito.tsx` tiene ~1500 lineas y **los seis bugs de este plan
  vivieron todos en la misma costura**. El review final recomendo partirlo en
  `useHojaGuardado` (guardado, mutex, sucio/sucioRef, timer, flush de salida),
  `useHistorialTrazos` (deshacer/rehacer) y dos componentes de presentacion.
  **Ojo al hacerlo:** ver §4.
- El buscador de la historia clinica no debouncea la red (`useDeferredValue`
  despriorriza el render, no la request). Con la respuesta ya liviana es
  eficiencia, no escala.
- El limite de body de 3 MB es global; podria acotarse a las rutas de hojas.
- La ruta de transcribir no tiene throttle propio y cada llamada es una request
  de vision paga.
- El endpoint de transcripcion no declara fallback ante un rechazo del modelo.
  Notas de psicologia son justo el contenido benigno-pero-adyacente que puede
  disparar un falso positivo de los clasificadores.

**Se puede vivir con esto:**

- `btnIconUI` mide 36px en todo el proyecto, bajo el piso de 44px. Todo lo nuevo
  lo sobreescribe localmente; cambiar el token compartido toca 16+ archivos y es
  decision tuya.
- Editor y panel no distinguen "sin hojas" de "fallo la consulta"; la historia
  clinica si. Inconsistencia interna del feature.
- Escape cierra el editor entero aunque haya un modal hijo abierto.
- Borrar una hoja no borra su borrador local; queda un huerfano inofensivo (los
  ids no se reusan, asi que nunca se puede ofrecer).
- El E2E nuevo del cierre con guardado en vuelo **afirma el sintoma, no la
  union al mutex**: si en tu maquina el segundo trazo mas el click tardan mas de
  2 segundos, pasa en verde sin cubrir nada. Conviene fijarlo con un orden
  request/response **antes** de hacer la descomposicion de arriba, que es
  justamente cuando ese test tiene que servir de red.

**Fuera de este feature, encontrado de paso:**

- `apps/web/e2e/cancelar-reprogramar.spec.ts:75,89` busca las tarjetas de cita
  por `"Apellido, Nombre"`, pero `CitaCard.tsx:192` renderiza `{nombre}
  {apellido}` sin coma. El selector resuelve a cero elementos: **esos dos tests
  deberian estar fallando por timeout hoy**. No se toco; merece su propio commit.

---

## 4. Lo unico que hay que leer antes de refactorizar esto

Seis veces en este plan aparecio el mismo patron: **un invariante cierto cuando
se escribio, invalidado en silencio por un llamador agregado despues.** Cuatro
estaban en el plan original. La quinta la creo la tanda de arreglos que cerro
las primeras cuatro. La sexta esta viva hoy, estructuralmente, y solo se
mantiene cerrada porque ningun camino actual la alcanza.

**La sexta:** en `guardarActivaSiSucia`, la rama `mismaHoja === false`. Si la
hoja activa cambia mientras un guardado esta en vuelo, ese guardado igual llega
al servidor, pero ni la base ni el borrador de la hoja vieja se realinean — y su
borrador queda con una base que ya no coincide, asi que nunca se vuelve a
ofrecer. Es la misma perdida silenciosa, una hoja mas alla.

Hoy no se alcanza: ninguno de los cuatro llamadores de `cargarHoja` puede
cambiar la hoja activa con un PUT en vuelo. **Esa es toda la garantia.** La
descomposicion en hooks mueve exactamente el mutex, el flush de salida y el
contrato del booleano, o sea que es el cambio con mas chances de despertarla.

Antes de mover cualquiera de esas piezas: enumerar los llamadores contra el
invariante, no contra el codigo. Es lo que encontro las seis.
