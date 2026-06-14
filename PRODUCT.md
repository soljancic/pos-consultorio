# Product

## Register

product

## Users

Personal de consultorios médicos pequeños y privados: la secretaria/recepcionista que agenda y cobra durante todo el día, el doctor o doctora que atiende, y el dueño (admin) que controla caja, deudas y reportes. Contexto: jornada clínica con interrupciones constantes, pacientes esperando, manejo de dinero en efectivo y datos sensibles de salud. No son usuarios técnicos; usan la herramienta entre llamadas y atenciones, muchas veces desde el mostrador y a veces desde el celular (PWA).

## Product Purpose

ConsulTech (POS del Consultorio) es el sistema operativo diario de un consultorio: agenda de citas con máquina de estados, cobros con pagos parciales, caja con apertura/arqueo ciego/cierre, control de deudores, gastos, pacientes con historia clínica, y reportes. Reemplaza el cuaderno + planilla + software clínico legacy por una sola herramienta multi-tenant. Éxito = la recepcionista agenda y cobra sin fricción, el dueño confía en que la caja cuadra, y nadie tiene que pensar en la herramienta.

## Brand Personality

Tranquilo y confiable. Profesional-clínico pero cálido, no frío. Transmite calma y control alrededor del dinero y los datos del paciente: confianza silenciosa, poco ruido visual, jerarquía clara. Tres palabras: sereno, claro, fiable.

## Anti-references

- **SaaS genérico / AI-slop**: nada de hero con gradient-text, grids de cards idénticas, eyebrow kickers en mayúsculas, glassmorphism decorativo, ni el look de startup plantillado.
- **Software clínico legacy**: nada del estético médico apretado, gris, lleno de dropdowns, tipo Windows-98 que suelen tener las herramientas de consultorio locales.

## Design Principles

1. **Calma sobre densidad** — la jerarquía guía el ojo a una cosa a la vez; el dueño debe leer el estado del día sin esfuerzo, no descifrar un tablero saturado.
2. **Confianza alrededor del dinero** — montos, deudas y caja se presentan con precisión (tabular-nums), color + forma (no solo color), y reaseguro en momentos de alto riesgo.
3. **Resistente a la interrupción** — el usuario se va y vuelve; el estado se preserva, las acciones primarias son obvias al reencontrar la pantalla.
4. **Honestidad clínica, no frialdad** — lenguaje en español correcto y humano, sin jerga técnica ni códigos de error; serio sin ser intimidante.
5. **Accesible por defecto** — touch targets >=44px, focus-visible ring, contraste AA, dark mode; la herramienta se usa con prisa y debe perdonar.

## Accessibility & Inclusion

WCAG AA como piso. Design system ya cableado: focus-visible ring de 3px, touch targets cómodos (>=44px), tokens semánticos con dark mode, `text-base` en mobile para evitar auto-zoom de iOS, color + forma para estados (no solo color). Considerar prefers-reduced-motion en cualquier animación. Usuarios no técnicos y posiblemente présbitas: tipografía legible, sin gris claro sobre fondos tintados.
