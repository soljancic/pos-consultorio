import { Rol } from '@pos/types'
import { ClipboardList, Stethoscope, Wallet, ShieldCheck, type LucideIcon } from 'lucide-react'

// Contenido del manual de ayuda in-app, organizado por rol. Editar el manual =
// editar este archivo (la pagina solo lo renderiza). `imagen` se cablea en la
// fase de capturas; sin imagen, la pagina muestra un placeholder.

export interface TemaAyuda {
  id: string
  titulo: string
  intro?: string
  pasos: string[]
  imagen?: string
}

export interface SeccionAyuda {
  rol: Rol
  label: string
  icono: LucideIcon
  temas: TemaAyuda[]
}

export const AYUDA: SeccionAyuda[] = [
  {
    rol: Rol.SECRETARIA,
    label: 'Secretaria',
    icono: ClipboardList,
    temas: [
      {
        id: 'agendar-cita',
        titulo: 'Agendar una cita',
        intro: 'Reservás un turno para un paciente con un doctor y un servicio.',
        pasos: [
          'Entrá a Agenda y tocá "Nueva cita" (o hacé clic en un horario vacío de la grilla del día).',
          'Elegí el paciente buscándolo por nombre, CI o teléfono. Si no existe, lo podés crear desde ahí.',
          'Elegí el doctor, el servicio, la fecha y la hora. El sistema avisa si el horario se solapa.',
          'Guardá: la cita queda en estado Pendiente y se crea su cobro automáticamente.',
        ],
      },
      {
        id: 'cobrar-cita',
        titulo: 'Cobrar una cita',
        intro: 'Registrás el pago, total o parcial, en una o varias formas de pago.',
        pasos: [
          'En la Agenda, en la tarjeta de la cita, tocá "Cobrar".',
          'Elegí la forma de pago (efectivo, QR/transferencia, tarjeta o vales) e ingresá el monto.',
          'Podés cobrar parcial: el saldo queda como deuda. Podés dividir en varias formas de pago.',
          'Confirmá. Si la caja no está abierta, el sistema te pide abrir el turno primero.',
        ],
      },
      {
        id: 'caja-turno',
        titulo: 'Abrir y cerrar la caja',
        intro: 'Sin la caja abierta no se cobra ni se registran gastos. Al cerrar se hace el arqueo.',
        pasos: [
          'Al empezar el día, abrí la caja desde el chip ámbar "Caja sin abrir" del menú e ingresá el monto inicial.',
          'Durante el día cobrás y registrás gastos normalmente.',
          'Al cerrar, andá a Caja y tocá "Cerrar caja": contá el efectivo y declaralo (arqueo ciego, sin ver lo esperado).',
          'Si la diferencia es 0 se aprueba sola; si no, queda pendiente de revisión del administrador.',
        ],
      },
      {
        id: 'deudores-whatsapp',
        titulo: 'Deudores y recordatorios por WhatsApp',
        intro: 'Ves quién debe y le mandás el recordatorio por WhatsApp en un toque.',
        pasos: [
          'Entrá a Deudores: la lista muestra la deuda real por paciente y su último pago.',
          'Tocá el ícono de WhatsApp en la fila del paciente.',
          'Se abre WhatsApp con el mensaje ya redactado (usa la plantilla del consultorio).',
        ],
      },
    ],
  },
  {
    rol: Rol.DOCTOR,
    label: 'Doctor',
    icono: Stethoscope,
    temas: [
      {
        id: 'mi-agenda',
        titulo: 'Ver mi agenda',
        intro: 'Al entrar ves solo tus citas. Podés cambiar de vista.',
        pasos: [
          'Entrá a Agenda: ya queda filtrada a tus citas.',
          'Cambiá entre Lista, Día, Semana y Mes con el selector de arriba a la derecha.',
          'En la Lista podés ordenar por Estado o por Hora.',
        ],
      },
      {
        id: 'registrar-atencion',
        titulo: 'Registrar la atención',
        intro: 'Dejás la nota clínica de la consulta y, si querés, agendás el control.',
        pasos: [
          'En tu cita tocá "Atención".',
          'Completá motivo, diagnóstico y tratamiento.',
          'Si corresponde, cargá el próximo control (se puede agendar directo) y adjuntá archivos (estudios, imágenes).',
          'Guardá. La atención queda en la historia clínica del paciente.',
        ],
      },
      {
        id: 'escribir-a-mano',
        titulo: 'Escribir la nota a mano',
        intro:
          'Desde una tablet o un celular con lápiz podés escribir la sesión a mano y después pasarla a texto.',
        pasos: [
          'Abrí la cita y tocá "Atención". Guardá la atención una primera vez: recién ahí se habilita escribir a mano.',
          'En el bloque "Notas manuscritas", tocá "Escribir a mano". Se abre la hoja a pantalla completa.',
          'Escribí con el lápiz. Podés cambiar grosor y color, borrar trazos y deshacer. La hoja se guarda sola cada pocos segundos.',
          'Tocá "+ Hoja" para agregar más hojas. Se numeran solas y podés pasar de una a otra con las flechas.',
          'Al terminar, cerrá la hoja y tocá "Transcribir a texto": el sistema lee tu escritura y la escribe en "Evolución / notas". Revisá el texto antes de guardar.',
          'En iPad, si notás que se te cortan los trazos, andá a Ajustes → Apple Pencil → Scribble y desactivalo. Scribble intenta convertir tu escritura a texto por su cuenta y a veces se queda con un trazo.',
          'Desde una computadora podés ver las hojas escritas, pero no escribir: para eso hace falta una tablet o un celular con lápiz.',
        ],
      },
      {
        id: 'receta',
        titulo: 'Emitir una receta',
        intro: 'Generás la receta en PDF con el membrete del consultorio.',
        pasos: [
          'Dentro de la Atención, andá a la sección Recetas y tocá "Nueva receta".',
          'Cargá los medicamentos (uno por línea) y las indicaciones.',
          'Descargá el PDF: sale con el membrete del consultorio y tu firma.',
        ],
      },
    ],
  },
  {
    rol: Rol.CAJA,
    label: 'Caja',
    icono: Wallet,
    temas: [
      {
        id: 'abrir-turno',
        titulo: 'Abrir el turno',
        intro: 'La jornada arranca declarando la caja chica.',
        pasos: [
          'Tocá el chip "Caja sin abrir" del menú.',
          'Ingresá el monto inicial (caja chica) y confirmá.',
          'A partir de ahí se pueden registrar cobros y gastos.',
        ],
      },
      {
        id: 'cobrar',
        titulo: 'Registrar un cobro',
        intro: 'Igual que la secretaria: total o parcial, una o varias formas de pago.',
        pasos: [
          'En la Agenda, tarjeta de la cita, tocá "Cobrar".',
          'Elegí forma de pago e ingresá el monto (puede ser parcial o dividido).',
          'Confirmá.',
        ],
      },
      {
        id: 'cerrar-arqueo',
        titulo: 'Cerrar caja (arqueo ciego)',
        intro: 'Contás el efectivo y lo declarás sin ver lo esperado.',
        pasos: [
          'Andá a Caja y tocá "Cerrar caja".',
          'Contá el efectivo físico y declaralo.',
          'El sistema compara con lo esperado: diferencia 0 se aprueba sola; si no, queda para revisión del admin.',
        ],
      },
    ],
  },
  {
    rol: Rol.ADMIN,
    label: 'Administrador',
    icono: ShieldCheck,
    temas: [
      {
        id: 'catalogo-doctores',
        titulo: 'Cargar doctores (foto, servicios y precio)',
        intro: 'Cada doctor con su color, foto, los servicios que atiende y su precio.',
        pasos: [
          'Andá a Catálogo, tab "Servicios y doctores", y tocá "Nuevo doctor" (o el lápiz para editar).',
          'Subí la foto del doctor (aparece en la agenda del día y en Horarios; sin foto, un círculo de color).',
          'Marcá los servicios que atiende. Opcional: ponele un precio por servicio (vacío = precio del servicio).',
          'Con un precio cargado, al agendar una cita de ese doctor con ese servicio el cobro usa ese precio.',
        ],
      },
      {
        id: 'usuarios',
        titulo: 'Crear usuarios y roles',
        intro: 'Cada persona entra con su cuenta y su rol (Admin, Secretaria, Doctor, Caja).',
        pasos: [
          'Andá a Configuración, tab Usuarios, y tocá "Nuevo usuario".',
          'Cargá nombre, email y rol. Si es DOCTOR, asocialo a su ficha de doctor.',
          'Si no ponés contraseña, el sistema le envía una invitación por correo para que defina la suya.',
        ],
      },
      {
        id: 'configuracion',
        titulo: 'Configurar el consultorio',
        intro: 'Datos, marca, mensajes, portal de reservas y email de cierre de caja.',
        pasos: [
          'Andá a Configuración, tab Consultorio.',
          'Cargá nombre, logo, moneda y zona horaria; subí el QR de pagos.',
          'Editá las plantillas de WhatsApp (recordatorio, deuda, contacto).',
          'Activá el portal de reservas (slug + toggle) y poné el email para los resúmenes de cierre de caja.',
        ],
      },
      {
        id: 'reportes',
        titulo: 'Reportes y comisiones',
        intro: 'El resultado del mes y la liquidación por doctor.',
        pasos: [
          'Andá a Reportes (solo administrador).',
          'Mirá ingresos por forma de pago, gastos, resultado neto y citas por estado.',
          'En la tabla por doctor ves su comisión (según el % cargado en su ficha).',
          'Exportá todo a Excel con un clic.',
        ],
      },
    ],
  },
]
