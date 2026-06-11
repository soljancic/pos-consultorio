import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Users } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, cardUI, chipIconUI } from '../../lib/ui'
import { PacienteModal } from './PacienteModal'
import type { Paciente } from '@pos/types'

export function PacientesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [modalNuevo, setModalNuevo] = useState(false)

  function handleSearch(value: string) {
    setSearch(value)
    clearTimeout((window as any).__searchTimer)
    ;(window as any).__searchTimer = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const { data: pacientes = [], isLoading } = useQuery<Paciente[]>({
    queryKey: ['pacientes', debouncedSearch],
    queryFn: () =>
      api.get(`/pacientes${debouncedSearch ? `?search=${debouncedSearch}` : ''}`).then((r) => r.data),
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={chipIconUI}>
            <Users className="h-4 w-4" aria-hidden="true" />
          </span>
          Pacientes
        </h1>
        <button onClick={() => setModalNuevo(true)} className={btnPrimaryUI}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo paciente
        </button>
      </div>

      <div className="p-4 sm:p-6 flex-1 overflow-auto">
        <div className="relative mb-4 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por nombre, CI, telefono..."
            aria-label="Buscar pacientes"
            className={cn(inputUI, 'pl-9')}
          />
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Buscando...</div>
        ) : (
          <div className={cn(cardUI, 'overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">CI</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Teléfono</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Deuda</th>
                </tr>
              </thead>
              <tbody>
                {pacientes.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/pacientes/${p.id}`)}
                    className="border-b last:border-0 hover:bg-muted/60 cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {p.apellido}, {p.nombre}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{p.dni || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{p.telefono || p.whatsapp || '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Number(p.deudaTotal) > 0 ? (
                        <span className="text-destructive font-medium">
                          {formatMoneda(Number(p.deudaTotal))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {pacientes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground/70">
                      {debouncedSearch ? 'No se encontraron pacientes' : 'No hay pacientes registrados'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalNuevo && <PacienteModal onClose={() => setModalNuevo(false)} />}
    </div>
  )
}
