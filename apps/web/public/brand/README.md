# Marca Consultech

Carpeta de identidad visual del producto. Todo lo que está en `public/` se
sirve estático desde la raíz: `public/brand/isotipo.svg` → `/brand/isotipo.svg`.

## Archivos esperados (dejalos acá con estos nombres)

| Archivo | Qué es | Dónde se usa |
|---------|--------|--------------|
| `isotipo.svg` | Solo el símbolo, sin texto | Favicon, sidebar colapsado, chips, PWA |
| `logotipo.svg` | Solo el texto "Consultech" | Footer, documentos |
| `imagotipo.svg` | Símbolo + texto juntos | Login, header del portal, emails, PDF de recetas |
| `isotipo-512.png` | Isotipo rasterizado 512x512 | PWA / og:image / emails (los clientes de correo no siempre soportan SVG) |

Variantes opcionales para dark mode: sufijo `-dark` (ej. `imagotipo-dark.svg`).

## Dónde está la marca hoy (puntos a cablear cuando esten los archivos)

- `apps/web/index.html` — `<title>` y favicon
- `apps/web/src/features/auth/LoginPage.tsx` — panel izquierdo y header mobile
- `apps/web/src/features/auth/EstablecerPasswordPage.tsx` — header
- `apps/web/src/components/shared/AppShell.tsx` — header del sidebar (expandido y colapsado)
- `apps/web/src/features/portal/ReservarPage.tsx` — header del portal publico
- `apps/api/src/modules/mail/mail.service.ts` — layout de los emails
- PDF de recetas (E2-M5) — encabezado

OJO: `Consultorio.logoUrl` es OTRA cosa: el logo de CADA consultorio (tenant),
se configura en /configuracion y se muestra en su portal. La marca Consultech
es la del producto.
