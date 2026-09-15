import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'
import { Button } from '../components/ui/Button'

type History = {
  date: string; page: number; pageCount: number
  summary: { total: number; closed: number; open: number; durationSeconds: number }
  campaigns: { id: number; name: string }[]; agents: { id: number; name: string }[]
  calls: { id: number; campaign: string; agent: string | null; clientKey: string | null
    businessName: string | null; person: string | null; phone: string; extension: string | null
    startedAt: string; endedAt: string | null; state: string; durationSeconds: number | null
    channel: string | null; disposition: string | null; notes: string | null }[]
}
function today() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Hermosillo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
function validDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function duration(seconds: number | null) {
  if (seconds === null) return 'Sin duración registrada'
  const value = Math.max(0, Math.floor(seconds))
  return `${Math.floor(value / 3600).toString().padStart(2, '0')}:${Math.floor(value % 3600 / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
}
const time = (value: string) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Hermosillo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value))

export default function DailyHistory() {
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? today()
  const campaign = params.get('campaignId') ?? ''
  const agent = admin ? params.get('agentId') ?? '' : ''
  const page = params.get('page') ?? '1'
  const [data, setData] = useState<History | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [updated, setUpdated] = useState<string | null>(null)
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    if (!validDate(date)) { setLoading(false); setError('Selecciona una fecha válida para consultar el historial.'); return }
    setLoading(true)
    const query = new URLSearchParams({ date, page })
    if (campaign) query.set('campaignId', campaign)
    if (agent) query.set('agentId', agent)
    api.calls.getHistory(query, controller.signal).then((result: History) => {
      if (!controller.signal.aborted) { setData(result); setUpdated(time(new Date().toISOString())) }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudo consultar el historial.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [date, campaign, agent, page, revision, user?.id, admin])

  return <section aria-labelledby="history-title">
    <div className="page-heading"><div className="eyebrow">Bitácora de llamadas</div><h1 id="history-title">{admin ? 'El día de tu equipo.' : 'Tu trabajo del día.'}</h1><p>Consulta las llamadas por su fecha de inicio. Horario de Hermosillo.</p></div>
    <div className="rounded-lg bg-surface p-6 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div><label htmlFor="history-date" className="block mb-1">Fecha</label><input id="history-date" type="date" value={date} aria-invalid={!validDate(date)} aria-describedby={!validDate(date) ? 'history-error' : undefined} onChange={e => change('date', e.target.value)} className="w-full rounded border p-2" /></div>
        <div><label htmlFor="history-campaign" className="block mb-1">Campaña</label><select id="history-campaign" value={campaign} onChange={e => change('campaignId', e.target.value)} className="w-full rounded border p-2"><option value="">Todas las campañas</option>{data?.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {admin && <div><label htmlFor="history-agent" className="block mb-1">Agente</label><select id="history-agent" value={agent} onChange={e => change('agentId', e.target.value)} className="w-full rounded border p-2"><option value="">Todos los agentes</option>{data?.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
        <div className="flex gap-2 items-end"><Button onClick={() => change('date', today())}>Hoy</Button><Button busy={loading} onClick={() => setRevision(v => v + 1)}>Actualizar</Button></div>
      </div>
    </div>
    {loading && <p role="status">Consultando el historial…</p>}
    {error && <div role="alert" id="history-error" className="rounded bg-red-50 p-4 text-red-700"><p>{error}</p><Button onClick={() => setRevision(v => v + 1)}>Reintentar</Button></div>}
    {!loading && !error && data && <>
      <dl className="history-summary">{[['Marcaciones', data.summary.total], ['Cerradas', data.summary.closed], ['Abiertas', data.summary.open], ['Tiempo registrado · cerradas', duration(data.summary.durationSeconds)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="text-gray-600 mb-4" role="status">Actualizado a las {updated}. {data.summary.total} llamadas en la fecha seleccionada.</p>
      {data.calls.length === 0 ? <div className="rounded-lg bg-surface p-6"><h2>No hay llamadas para estos filtros.</h2><p>Elige otra fecha o campaña para consultar más actividad.</p></div> : <ol className="history-list" aria-label="Llamadas, más recientes primero">{data.calls.map(call => <li key={call.id} className="history-entry">
        <div className="history-time"><time dateTime={call.startedAt}>{time(call.startedAt)}</time><span>{call.state === 'open' ? 'Abierta' : 'Cerrada'}</span><small>Intento #{call.id}</small></div>
        <div className="history-body"><div className="flex flex-wrap justify-between gap-2"><h2>{call.businessName || 'Razón social no registrada'}</h2><span>{call.campaign}</span></div>
          <p className="text-gray-600">Clave: {call.clientKey || 'No registrada'}{admin && ` · Agente: ${call.agent || 'No registrado'}`}</p>
          <dl className="history-details"><div><dt>Persona contactada</dt><dd>{call.person || 'No registrada'}</dd></div><div><dt>Teléfono marcado</dt><dd>{call.phone}{call.extension && ` · Ext. ${call.extension}`}</dd></div><div><dt>Duración</dt><dd>{call.state === 'open' ? 'En curso' : duration(call.durationSeconds)}</dd></div><div><dt>Canalización</dt><dd>{call.channel || (call.state === 'open' ? 'Pendiente de cierre' : 'No registrada')}</dd></div></dl>
          <details><summary>Ver detalle de la llamada</summary><p>Disposición: {call.disposition || 'Sin clasificación registrada'}</p><p>Fin: {call.endedAt ? new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Hermosillo', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(call.endedAt)) : 'Sin cierre'}</p><h3>Notas</h3><p className="whitespace-pre-wrap">{call.notes || 'Sin notas registradas.'}</p></details>
        </div>
      </li>)}</ol>}
      <div className="flex flex-wrap justify-between items-center gap-3 mt-4"><Button disabled={data.page <= 1} onClick={() => change('page', String(data.page - 1))}>Anterior</Button><span>Página {data.page} de {data.pageCount}</span><Button disabled={data.page >= data.pageCount} onClick={() => change('page', String(data.page + 1))}>Siguiente</Button></div>
    </>}
  </section>
}
