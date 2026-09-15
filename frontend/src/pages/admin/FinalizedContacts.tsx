import { useEffect, useState } from 'react'
import SearchInput from '../../components/ui/SearchInput'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../services/api'

type Result = Awaited<ReturnType<typeof api.admin.getFinalizedContacts>>

export default function FinalizedContacts() {
  const { user } = useAuth()
  const [campaigns, setCampaigns] = useState<{campaign_id: number; name: string}[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result>({contacts: [], total: 0})

  useEffect(() => {
    if (user?.role !== 'admin') return
    let cancelled = false
    setLoading(true)
    setError(null)
    const timer = setTimeout(async () => {
      try {
        const [options, data] = await Promise.all([
          api.campaigns.getAll(),
          api.admin.getFinalizedContacts(campaignId ? Number(campaignId) : null, search.trim(), page),
        ])
        if (!cancelled) { setCampaigns(options.campaigns); setResult(data) }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudo consultar el listado.')
      } finally { if (!cancelled) setLoading(false) }
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [user?.role, campaignId, search, page, retry])

  if (user?.role !== 'admin') return <p>Acceso no autorizado.</p>

  return <section className="space-y-5 rounded-lg bg-surface p-6 shadow">
    <div>
      <h2 className="text-xl font-bold">Contactos finalizados</h2>
      <p className="mt-2 text-gray-600">Ya tuvieron un resultado Exitoso o una encuesta contestada.
        No volverán a aparecer para llamar en esa campaña, aunque se abra otra ronda o se importe de nuevo la base.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <label>Campaña
        <select className="mt-2 block w-full rounded border p-3" value={campaignId}
          onChange={event => { setCampaignId(event.target.value); setPage(1) }}>
          <option value="">Todas las campañas</option>
          {campaigns.map(c => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}
        </select>
      </label>
      <div><label htmlFor="finalized-search">Buscar por clave o razón social</label>
        <SearchInput id="finalized-search" onClear={() => { setSearch(''); setPage(1) }} className="mt-2 block w-full rounded border p-3" value={search} maxLength={150}
          onChange={event => { setSearch(event.target.value); setPage(1) }} />
      </div>
    </div>
    {loading && <p role="status">Consultando contactos finalizados...</p>}
    {error && <div role="alert" className="rounded bg-red-50 p-4 text-red-700">
      <p>{error}</p><button className="mt-2 underline" onClick={() => setRetry(value => value + 1)}>Reintentar</button>
    </div>}
    {!loading && !error && <>
      <p>{result.total} contactos finalizados. Fechas en horario de Hermosillo.</p>
      {result.contacts.length === 0 ? <p>No hay contactos que coincidan con los filtros.</p> :
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50"><tr>
            {['Clave', 'Razón social', 'Campaña', 'Motivo', 'Fecha', 'Llamadas de origen'].map(title =>
              <th key={title} scope="col" className="p-3 text-left">{title}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-200">{result.contacts.map(contact =>
            <tr key={`${contact.campaign_id}:${contact.client_id}`}>
              <td className="p-3">{contact.clave}</td><td className="p-3">{contact.razon_social ?? 'Sin razón social'}</td>
              <td className="p-3">{contact.campaign}</td>
              <td className="p-3">{[contact.successful && 'Exitoso', contact.survey_completed && 'Encuesta contestada'].filter(Boolean).join(' y ')}</td>
              <td className="p-3 whitespace-nowrap">{new Date(contact.finalized_at).toLocaleString('es-MX', {timeZone: 'America/Hermosillo'})}</td>
              <td className="p-3">{contact.attempt_ids.map(id => `#${id}`).join(', ')}</td>
            </tr>)}</tbody>
        </table></div>}
      <div className="flex items-center gap-4">
        <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button>
        <span>Página {page} de {Math.max(1, Math.ceil(result.total / 50))}</span>
        <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={page * 50 >= result.total} onClick={() => setPage(value => value + 1)}>Siguiente</button>
      </div>
    </>}
  </section>
}
