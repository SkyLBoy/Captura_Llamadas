import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../services/api'

type Campaign = { campaign_id: number; name: string }

const months = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function currentPeriod() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Hermosillo', year: 'numeric', month: 'numeric',
  }).formatToParts(new Date())
  return {
    year: parts.find(part => part.type === 'year')!.value,
    month: parts.find(part => part.type === 'month')!.value,
  }
}

export default function Reports() {
  const { user } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [period, setPeriod] = useState(currentPeriod)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    if (user?.role !== 'admin') return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    api.campaigns.getAll()
      .then(result => {
        if (!Array.isArray(result.campaigns)) {
          throw new Error('La respuesta de campañas no es válida.')
        }
        if (!cancelled) setCampaigns(result.campaigns)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las campañas.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user?.id, user?.role, retry])

  const clearFeedback = () => {
    setDownloadError(null)
    setSuccess(null)
  }

  const download = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current || loading || loadError || user?.role !== 'admin') return
    clearFeedback()
    const campaign = campaigns.find(item => item.campaign_id === Number(campaignId))
    const year = Number(period.year)
    const month = Number(period.month)
    if (!campaign || !Number.isInteger(year) || year < 2020 || year > 2100 ||
        !Number.isInteger(month) || month < 1 || month > 12) {
      setDownloadError('Selecciona una campaña, un año entre 2020 y 2100 y un mes válido.')
      return
    }
    inFlight.current = true
    setDownloading(true)
    try {
      const { blob, filename } = await api.reports.getMonthlyClosing(campaign.campaign_id, year, month)
      if (blob.size === 0) throw new Error('El servidor devolvió un archivo vacío.')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      try {
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setSuccess(`Descarga iniciada: ${campaign.name}, ${months[month - 1]} de ${year}.`)
    } catch (error: unknown) {
      setDownloadError(error instanceof Error ? error.message : 'No se pudo descargar el reporte.')
    } finally {
      inFlight.current = false
      setDownloading(false)
    }
  }

  if (!user || user.role !== 'admin') return <p>Acceso no autorizado</p>

  return (
    <section className="rounded-lg bg-surface p-6 shadow" aria-labelledby="reports-title">
      <h2 id="reports-title" className="mb-2 text-xl font-bold">Reportes y avances del mes</h2>
      <p className="mb-4 text-gray-600">Puedes descargar el avance cuando lo necesites, sin esperar al fin de mes. Selecciona la campaña y el mes que deseas consultar.</p>
      <div className="mb-4 rounded bg-surface p-4 border"><p>El Excel incluye los registros disponibles al generarlo. Descargarlo no cierra el mes ni modifica las llamadas.</p><p className="mt-2 text-gray-600">El formato conserva el concentrado y el historial acumulados del año hasta el mes seleccionado. En SILIMEX, la hoja de encuestas corresponde al mes seleccionado. El detalle incluye llamadas cerradas; las abiertas se contabilizan en el concentrado.</p></div>
      {loading && <p role="status">Cargando campañas...</p>}
      {loadError && (
        <div role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-700">
          <p>{loadError}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-2 rounded border px-3 py-2">Reintentar</button>
        </div>
      )}
      {!loading && !loadError && campaigns.length === 0 && <p>No hay campañas disponibles.</p>}
      <form noValidate onSubmit={download}>
        <fieldset disabled={loading || !!loadError || downloading || campaigns.length === 0} className="space-y-4 disabled:opacity-60">
          <div>
            <label htmlFor="report-campaign" className="mb-1 block">Campaña</label>
            <select id="report-campaign" required value={campaignId} onChange={event => { setCampaignId(event.target.value); clearFeedback() }} className="w-full rounded border p-2">
              <option value="">Selecciona una campaña</option>
              {campaigns.map(campaign => <option key={campaign.campaign_id} value={campaign.campaign_id}>{campaign.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="report-year" className="mb-1 block">Año</label>
              <input id="report-year" type="number" min="2020" max="2100" step="1" required value={period.year} onChange={event => { setPeriod({ ...period, year: event.target.value }); clearFeedback() }} className="w-full rounded border p-2" />
            </div>
            <div>
              <label htmlFor="report-month" className="mb-1 block">Mes</label>
              <select id="report-month" value={period.month} onChange={event => { setPeriod({ ...period, month: event.target.value }); clearFeedback() }} className="w-full rounded border p-2">
                {months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={!campaignId} className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">
            {downloading ? 'Generando Excel...' : 'Descargar Excel'}
          </button>
        </fieldset>
      </form>
      {downloadError && <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-red-700">{downloadError}</p>}
      {success && <p role="status" className="mt-4 rounded bg-green-50 p-3 text-green-800">{success}</p>}
    </section>
  )
}
