import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, Plus } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda } from '../../lib/utils'
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
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <h1 className="text-lg font-semibold text-slate-800">Pacientes</h1>
        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo paciente
        </button>
      </div>

      <div className="p-6 flex-1 overflow-auto">
        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por nombre, DNI, telefono..."
            className="w-full pl-9 pr-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {isLoading ? (
          <div className="text-center text-slate-500 py-8">Buscando...</div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Paciente</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">DNI</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">WhatsApp</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Deuda</th>
                </tr>
              </thead>
              <tbody>
                {pacientes.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/pacientes/${p.id}`)}
                    className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {p.apellido}, {p.nombre}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.dni || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{p.whatsapp || p.telefono || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      {Number(p.deudaTotal) > 0 ? (
                        <span className="text-red-600 font-medium">
                          {formatMoneda(Number(p.deudaTotal))}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {pacientes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
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
