import { useEffect, useRef, useState } from 'react'
import { useConfirm } from '../../components/ui/ConfirmProvider'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../services/api'

type Campaign = {
  campaign_id: number
  name: string
}

type Agent = {
  user_id: number
  full_name: string
  role: string
  is_active: boolean
}

type RoundSummary = Awaited<
  ReturnType<typeof api.admin.getRoundSummary>
>

type RoundHistory = Awaited<
    ReturnType<typeof api.admin.getRoundHistory>
>['rounds']

function formatRoundDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'

  return date.toLocaleString('es-MX', {
    timeZone: 'America/Hermosillo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function WorkRounds() {
  const { user } = useAuth()
  const confirm = useConfirm()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [optionsRetry, setOptionsRetry] = useState(0)
  const [roundName, setRoundName] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [startSuccess, setStartSuccess] = useState<string | null>(null)
  const startInFlight = useRef(false)
  const [summary, setSummary] = useState<RoundSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryRetry, setSummaryRetry] = useState(0)
  const [history, setHistory] = useState<RoundHistory>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyRetry, setHistoryRetry] = useState(0)  

  useEffect(() => {
    if (user?.role !== 'admin') return

    let cancelled = false
    setLoading(true)
    setError(null)

    async function loadOptions() {
      try {
        const [campaignResponse, userResponse] = await Promise.all([
          api.campaigns.getAll(),
          api.admin.getUsers(),
        ])

        if (cancelled) return

        const users: Agent[] = userResponse.users
        setCampaigns(campaignResponse.campaigns)
        setAgents(
          users.filter(item => item.role === 'agent' && item.is_active)
        )
      } catch (cause: unknown) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'No se pudieron cargar las opciones.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadOptions()
    return () => {
      cancelled = true
    }
  }, [user?.role, optionsRetry]) 

    useEffect(() => {
  if (user?.role !== 'admin') return

  let cancelled = false

  setHistory([])
  setHistoryError(null)
  setHistoryLoading(false)

  if (!campaignId || !agentId) return

  setHistoryLoading(true)

  async function loadHistory() {
    try {
      const result = await api.admin.getRoundHistory(
        Number(campaignId),
        Number(agentId)
      )

      if (!cancelled) setHistory(result.rounds)
    } catch (cause: unknown) {
      if (!cancelled) {
        setHistoryError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo cargar el historial.'
        )
      }
    } finally {
      if (!cancelled) setHistoryLoading(false)
    }
  }

  loadHistory()

  return () => {
    cancelled = true
  }
}, [user?.role, campaignId, agentId, summaryRetry, historyRetry])

    async function handleStartRound() {
    if (
        startInFlight.current ||
        loading ||
        error ||
        summaryLoading ||
        summaryError ||
        !summary ||
        user?.role !== 'admin'
    ) return

    setStartError(null)
    setStartSuccess(null)

    const name = roundName.trim()

    if (!name || name.length > 150) {
        setStartError('Escribe un nombre de entre 1 y 150 caracteres.')
        return
    }

    if (summary.hasOpenCall) {
        setStartError('El agente debe cerrar su llamada abierta primero.')
        return
    }

    const campaign = campaigns.find(
        item => item.campaign_id === Number(campaignId)
    )
    const agent = agents.find(
        item => item.user_id === Number(agentId)
    )

    if (!campaign || !agent) return

    startInFlight.current = true
    const confirmed = await confirm({ title: 'Habilitar ronda de trabajo', action: 'Habilitar ronda', message:
        `¿Habilitar "${name}" para ${agent.full_name} en ${campaign.name}?\n\n` +
        `Contactos previstos: ${summary.summary.eligible}.\n` +
        'Se finalizará la ronda actual, si existe. El historial se conservará.'
    })

    if (!confirmed) { startInFlight.current = false; return }

    startInFlight.current = true
    setStarting(true)

    try {
        const result = await api.admin.startRound({
        campaignId: campaign.campaign_id,
        agentId: agent.user_id,
        name,
        expectedRoundId: summary.round?.round_id ?? null,
        })

        setStartSuccess(
        `Ronda "${result.round.name}" habilitada para ${agent.full_name}: ` +
        `${result.enabledContacts} contactos.`
        )
        setRoundName('')
    } catch (cause: unknown) {
        setStartError(
        cause instanceof Error
            ? cause.message
            : 'No se pudo confirmar la creación de la ronda.'
        )
    } finally {
        startInFlight.current = false
        setStarting(false)

        // Consultar el estado actual antes de permitir otra operación.
        setSummary(null)
        setSummaryRetry(value => value + 1)
    }
 }

  useEffect(() => {
    if (user?.role !== 'admin') return

    let cancelled = false
    setSummary(null)
    setSummaryError(null)
    setSummaryLoading(false)

    if (!campaignId || !agentId) return

    setSummaryLoading(true)

    async function loadSummary() {
      try {
        const result = await api.admin.getRoundSummary(
          Number(campaignId),
          Number(agentId)
        )

        if (!cancelled) setSummary(result)
      } catch (cause: unknown) {
        if (!cancelled) {
          setSummaryError(
            cause instanceof Error
              ? cause.message
              : 'No se pudo consultar el resumen.'
          )
        }
      } finally {
        if (!cancelled) setSummaryLoading(false)
      }
    }

    loadSummary()
    return () => {
      cancelled = true
    }
  }, [user?.role, campaignId, agentId, summaryRetry])

  if (user?.role !== 'admin') {
    return <p>Acceso no autorizado.</p>
  }

  return (
    <section className="space-y-6 rounded-lg bg-surface p-6 shadow">
      <div>
        <h2 className="text-xl font-bold">Rondas de trabajo</h2>
        <p className="mt-2 text-gray-600">
          Consulta la base asignada antes de habilitar una nueva ronda.
        </p>
      </div>

      {loading && <p role="status">Cargando campañas y agentes...</p>}

      {error && (
        <div role="alert" className="rounded bg-red-50 p-4 text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setOptionsRetry(value => value + 1)}
            className="mt-2 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      <fieldset
        disabled={loading || error !== null || starting}
        className="grid gap-4 md:grid-cols-2"
      >
        <legend className="sr-only">Campaña y agente</legend>

        <div>
          <label htmlFor="round-campaign">Campaña</label>
          <select
            id="round-campaign"
            value={campaignId}
            onChange={event => {
              setSummary(null)
              setCampaignId(event.target.value)
              setStartError(null)
              setStartSuccess(null)
              setRoundName('')
              setHistory([])
              setHistoryError(null)
            }}
            className="mt-2 block w-full rounded border p-3"
          >
            <option value="">Selecciona una campaña</option>
            {campaigns.map(item => (
              <option key={item.campaign_id} value={item.campaign_id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="round-agent">Agente</label>
          <select
            id="round-agent"
            value={agentId}
            onChange={event => {
              setSummary(null)
              setAgentId(event.target.value)
              setStartError(null)
              setStartSuccess(null)
              setRoundName('')
              setHistory([])
              setHistoryError(null)
            }}
            className="mt-2 block w-full rounded border p-3"
          >
            <option value="">Selecciona un agente</option>
            {agents.map(item => (
              <option key={item.user_id} value={item.user_id}>
                {item.full_name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {!loading && !error && agents.length === 0 && (
        <p>No hay agentes activos disponibles.</p>
      )}

      {summaryLoading && <p role="status">Consultando la base...</p>}

      {summaryError && (
        <div role="alert" className="rounded bg-red-50 p-4 text-red-700">
          <p>{summaryError}</p>
          <button
            type="button"
            onClick={() => setSummaryRetry(value => value + 1)}
            className="mt-2 underline"
          >
            Reintentar consulta
          </button>
        </div>
      )}

      {summary && !summaryLoading && !summaryError && (
        <div className="space-y-3 rounded border p-4">
          <h3 className="font-semibold">
            Ronda actual: {summary.round?.name ?? 'Sin ronda activa'}
          </h3>

          {summary.round && (
            <div className="space-y-1 text-sm text-gray-600">
              <p>
                <span className= "font-medium">Inició:</span> 
                {formatRoundDate(summary.round.started_at)}
              </p>
              <p>
                <span className= "font-medium">Finalizó:</span>
                {summary.round.ended_at
                  ? formatRoundDate(summary.round.ended_at)
                  : 'En curso'}
              </p>
              <p>Horario de Hermosillo</p>
            </div>
          )}

          <ul className="list-disc space-y-1 pl-5">
            <li>Contactos asignados: {summary.summary.assigned}</li>
            <li>En Blacklist: {summary.summary.blocked}</li>
            <li>Finalizados fuera de Blacklist: {summary.summary.finalized}</li>
            <li>Inactivos sin bloqueo ni finalización: {summary.summary.inactive}</li>
            <li>Disponibles para una nueva ronda: {summary.summary.eligible}</li>
          </ul>

          {summary.hasOpenCall && (
            <p role="alert" className="text-amber-800">
              El agente tiene una llamada abierta. Debe cerrarla antes
              de habilitar otra ronda.
            </p>
          )}
        </div>
      )}

            {summary && !summaryLoading && !summaryError && (
        <div className="space-y-3 rounded border p-4">
            <label htmlFor="round-name" className="block font-medium">
            Nombre de la nueva ronda
            </label>

            <input
            id="round-name"
            value={roundName}
            onChange={event => setRoundName(event.target.value)}
            maxLength={150}
            disabled={starting}
            placeholder="Ejemplo: SILIMEX — Segunda ronda de septiembre"
            className="block w-full rounded border p-3"
            />

            <button
            type="button"
            onClick={handleStartRound}
            disabled={
                starting ||
                loading ||
                error !== null ||
                summary.hasOpenCall ||
                !roundName.trim()
            }
            className="rounded-md bg-indigo-600 px-5 py-3 text-white enabled:hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
            {starting ? 'Habilitando...' : 'Habilitar nueva ronda'}
            </button>
        </div>
        )}

        {startError && (
        <p role="alert" className="rounded bg-red-50 p-4 text-red-700">
            {startError}
        </p>
        )}

        {startSuccess && (
        <p role="status" className="rounded bg-green-50 p-4 text-green-800">
            {startSuccess}
        </p>
        )}

        {campaignId && agentId && (
  <div className="space-y-4 border-t pt-6">
    <h3 className="text-lg font-semibold">Historial de rondas</h3>

    {historyLoading && (
      <p role="status">Cargando historial...</p>
    )}

    {historyError && (
      <div role="alert" className="rounded bg-red-50 p-4 text-red-700">
        <p>{historyError}</p>
        <button
          type="button"
          onClick={() => setHistoryRetry(value => value + 1)}
          className="mt-2 underline"
        >
          Reintentar
        </button>
      </div>
    )}

    {!historyLoading && !historyError && (
      history.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="p-3 text-left">Ronda</th>
                <th scope="col" className="p-3 text-left">Inicio</th>
                <th scope="col" className="p-3 text-left">Finalización</th>
                <th scope="col" className="p-3 text-left">Estado</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {history.map(round => (
                <tr key={round.round_id}>
                  <td className="p-3">{round.name}</td>

                  <td className="whitespace-nowrap p-3">
                    {formatRoundDate(round.started_at)}
                  </td>

                  <td className="whitespace-nowrap p-3">
                    {round.ended_at
                      ? formatRoundDate(round.ended_at)
                      : 'En curso'}
                  </td>

                  <td className="p-3">
                    {round.ended_at ? 'Finalizada' : 'Activa'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-2 text-sm text-gray-600">
            Fechas en horario de Hermosillo.
          </p>
        </div>
      ) : (
        <p>No hay rondas registradas para esta campaña y agente.</p>
      )
    )}
  </div>
)}

    </section>
  )
}