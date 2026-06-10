// Diagnostico: citas recientes con estado, saldo y consultorio
// Correr desde apps/api: node scripts/debug-citas.js
const fs = require('fs')
const path = require('path')
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
const m = env.match(/DATABASE_URL="?([^"\r\n]+)"?/)
if (m) process.env.DATABASE_URL = m[1]
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

;(async () => {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const citas = await p.cita.findMany({
    where: { createdAt: { gte: desde } },
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: {
      paciente: { select: { nombre: true, apellido: true } },
      cobro: { select: { total: true, saldoPendiente: true, estado: true } },
      consultorio: { select: { nombre: true } },
    },
  })
  for (const c of citas) {
    console.log(
      [
        c.consultorio.nombre.padEnd(20),
        (c.paciente.apellido + ', ' + c.paciente.nombre).padEnd(22),
        ('estado=' + c.estado).padEnd(22),
        'fechaHora=' + c.fechaHora.toISOString(),
        c.cobro
          ? 'saldo=' + c.cobro.saldoPendiente + ' cobroEstado=' + c.cobro.estado
          : 'SIN COBRO',
      ].join(' '),
    )
  }
  await p.$disconnect()
})()
