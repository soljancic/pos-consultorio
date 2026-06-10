// Reparacion puntual: citas marcadas COBRADO a mano con saldo pendiente
// (bug del boton de estado, corregido en citas.service). Las vuelve a CON_DEUDA.
// Correr desde apps/api: node scripts/reparar-cobrado-con-saldo.js
const fs = require('fs')
const path = require('path')
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
const m = env.match(/DATABASE_URL="?([^"\r\n]+)"?/)
if (m) process.env.DATABASE_URL = m[1]
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

;(async () => {
  const inconsistentes = await p.cita.findMany({
    where: {
      estado: 'COBRADO',
      cobro: { saldoPendiente: { gt: 0 } },
    },
    include: {
      paciente: { select: { nombre: true, apellido: true } },
      cobro: { select: { saldoPendiente: true } },
    },
  })

  if (inconsistentes.length === 0) {
    console.log('Sin citas COBRADO con saldo pendiente. Nada que reparar.')
  }

  for (const c of inconsistentes) {
    await p.$transaction([
      p.cita.update({ where: { id: c.id }, data: { estado: 'CON_DEUDA' } }),
      p.log.create({
        data: {
          consultorioId: c.consultorioId,
          entidad: 'Cita',
          entidadId: c.id,
          accion: 'STATE_CHANGE',
          payloadAntes: { estado: 'COBRADO' },
          payloadDespues: {
            estado: 'CON_DEUDA',
            motivo: 'reparacion: COBRADO manual con saldo pendiente (bug boton estado)',
          },
        },
      }),
    ])
    console.log(
      `Reparada: ${c.paciente.apellido}, ${c.paciente.nombre} — saldo ${c.cobro.saldoPendiente} → CON_DEUDA`,
    )
  }
  await p.$disconnect()
})()
