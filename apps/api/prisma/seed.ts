import { PrismaClient, Rol, EstadoCita } from '@prisma/client'
import * as argon2 from 'argon2'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const passwordHash = await argon2.hash('Password123!')

  // Consultorio demo
  const consultorio = await prisma.consultorio.upsert({
    where: { id: 'demo-consultorio-id' },
    update: {},
    create: {
      id: 'demo-consultorio-id',
      nombre: 'Consultorio Demo',
      moneda: 'ARS',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  })

  // Admin
  const admin = await prisma.usuario.upsert({
    where: { email_consultorioId: { email: 'admin@demo.com', consultorioId: consultorio.id } },
    update: {},
    create: {
      consultorioId: consultorio.id,
      nombre: 'Admin Demo',
      email: 'admin@demo.com',
      passwordHash,
      rol: Rol.ADMIN,
    },
  })

  // Secretaria
  const secretaria = await prisma.usuario.upsert({
    where: { email_consultorioId: { email: 'secretaria@demo.com', consultorioId: consultorio.id } },
    update: {},
    create: {
      consultorioId: consultorio.id,
      nombre: 'Ana Lopez',
      email: 'secretaria@demo.com',
      passwordHash,
      rol: Rol.SECRETARIA,
    },
  })

  // Doctor usuario
  const doctorUsuario = await prisma.usuario.upsert({
    where: { email_consultorioId: { email: 'doctor@demo.com', consultorioId: consultorio.id } },
    update: {},
    create: {
      consultorioId: consultorio.id,
      nombre: 'Dr. Carlos Perez',
      email: 'doctor@demo.com',
      passwordHash,
      rol: Rol.DOCTOR,
    },
  })

  // Doctor record
  const doctor = await prisma.doctor.upsert({
    where: { usuarioId: doctorUsuario.id },
    update: {},
    create: {
      consultorioId: consultorio.id,
      usuarioId: doctorUsuario.id,
      nombre: 'Dr. Carlos Perez',
      especialidad: 'Medicina General',
      colorAgenda: '#3B82F6',
    },
  })

  // Servicios
  const servicios = [
    { nombre: 'Consulta General', duracionMin: 30, precioBase: 5000 },
    { nombre: 'Control', duracionMin: 20, precioBase: 3500 },
    { nombre: 'Electrocardiograma', duracionMin: 45, precioBase: 8000 },
    { nombre: 'Certificado medico', duracionMin: 15, precioBase: 2000 },
  ]

  const serviciosCreados = []
  for (const s of servicios) {
    const servicio = await prisma.servicio.upsert({
      where: { id: `servicio-${s.nombre.toLowerCase().replace(/ /g, '-')}` },
      update: {},
      create: {
        id: `servicio-${s.nombre.toLowerCase().replace(/ /g, '-')}`,
        consultorioId: consultorio.id,
        ...s,
      },
    })
    serviciosCreados.push(servicio)
  }

  // Pacientes demo
  const pacientes = [
    { nombre: 'Maria', apellido: 'Gonzalez', dni: '30123456', telefono: '155551234' },
    { nombre: 'Juan', apellido: 'Rodriguez', dni: '28456789', telefono: '155555678' },
    { nombre: 'Laura', apellido: 'Martinez', dni: '35789012', telefono: '155559012' },
    { nombre: 'Pedro', apellido: 'Sanchez', dni: '25012345', telefono: '155552345' },
    { nombre: 'Sofia', apellido: 'Lopez', dni: '38345678', telefono: '155556789' },
  ]

  const pacientesCreados = []
  for (const p of pacientes) {
    const paciente = await prisma.paciente.upsert({
      where: { id: `paciente-${p.dni}` },
      update: {},
      create: { id: `paciente-${p.dni}`, consultorioId: consultorio.id, ...p },
    })
    pacientesCreados.push(paciente)
  }

  // Citas de hoy con distintos estados (para ver la agenda poblada)
  const hoy = new Date()
  const citasDemo = [
    { paciente: 0, hora: 9, estado: EstadoCita.COBRADO, servicioIdx: 0 },
    { paciente: 1, hora: 10, estado: EstadoCita.ATENDIDA, servicioIdx: 1 },
    { paciente: 2, hora: 11, estado: EstadoCita.EN_ATENCION, servicioIdx: 0 },
    { paciente: 3, hora: 12, estado: EstadoCita.LLEGO, servicioIdx: 2 },
    { paciente: 4, hora: 14, estado: EstadoCita.CONFIRMADA, servicioIdx: 3 },
    { paciente: 0, hora: 15, estado: EstadoCita.PENDIENTE, servicioIdx: 1 },
  ]

  for (const c of citasDemo) {
    const fecha = new Date(hoy)
    fecha.setHours(c.hora, 0, 0, 0)
    const servicio = serviciosCreados[c.servicioIdx]

    const cita = await prisma.cita.create({
      data: {
        consultorioId: consultorio.id,
        pacienteId: pacientesCreados[c.paciente].id,
        doctorId: doctor.id,
        servicioId: servicio.id,
        fechaHora: fecha,
        duracionMin: servicio.duracionMin,
        estado: c.estado,
        createdById: secretaria.id,
      },
    })

    // Cobro para cada cita
    const cobro = await prisma.cobro.create({
      data: {
        citaId: cita.id,
        consultorioId: consultorio.id,
        total: servicio.precioBase,
        saldoPendiente:
          c.estado === EstadoCita.COBRADO ? 0 : servicio.precioBase,
        estado:
          c.estado === EstadoCita.COBRADO ? 'COMPLETO' : 'PENDIENTE',
      },
    })

    // Pago si esta cobrado
    if (c.estado === EstadoCita.COBRADO) {
      await prisma.pago.create({
        data: {
          cobroId: cobro.id,
          formaPago: 'EFECTIVO',
          monto: servicio.precioBase,
          createdById: secretaria.id,
        },
      })
    }
  }

  console.log('Seed completado.')
  console.log('')
  console.log('Usuarios de prueba:')
  console.log('  Admin:      admin@demo.com      / Password123!')
  console.log('  Secretaria: secretaria@demo.com / Password123!')
  console.log('  Doctor:     doctor@demo.com     / Password123!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
