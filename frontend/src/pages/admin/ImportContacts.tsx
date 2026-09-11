import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../services/api'

type Campaign = {
  campaign_id: number
  name: string
}

type Agent = {
  user_id: number
  full_name: string
  username: string
  role: string
  is_active: boolean
}

type ImportSummary= {
    importId: number
    rowsProcessed: number
    imported: number
    duplicate: number
    rejected: number
}

export default function ImportContacts() {
  const { user } = useAuth()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const importInFlight = useRef(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (user?.role !== 'admin') return

    let cancelled = false
    setLoading(true)
    setError(null)

    const loadOptions = async () => {
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
              : 'No se pudieron cargar las campañas y los agentes.'
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
  }, [user?.role, retry])
  
async function handleImport() {
  if (importInFlight.current || loading || error) return
  if (user?.role !== 'admin') return

  setImportError(null)
  setSummary(null)

  const campaign = campaigns.find(
    item => item.campaign_id === Number(campaignId)
  )
  const agent = agents.find(
    item => item.user_id === Number(agentId)
  )

  if (!campaign || !agent || !file || fileError) {
    setImportError('Selecciona una campaña, un agente y un archivo válido.')
    return
  }

  importInFlight.current = true
  setImporting(true)

  try {
    const result: ImportSummary = await api.contacts.import(
      file,
      campaign.campaign_id,
      agent.user_id
    )

    setSummary(result)
    setFile(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  } catch (cause: unknown) {
    setImportError(
      cause instanceof Error
        ? cause.message
        : 'No se pudo importar el archivo.'
    )
  } finally {
    importInFlight.current = false
    setImporting(false)
  }
}
  if (!user || user.role !== 'admin') {
    return <p>Acceso no autorizado.</p>
  }

  return (
    <section className="space-y-6 rounded-lg bg-white p-6 shadow">
      <div>
        <h2 className="text-xl font-bold">Importar contactos</h2>
        <p className="mt-2 text-gray-600">
          Selecciona la campaña y el agente responsable de la base.
        </p>
      </div>

      {loading && <p role="status">Cargando campañas y agentes...</p>}

      {error && (
        <div role="alert" className="rounded bg-red-50 p-4 text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetry(value => value + 1)}
            className="mt-2 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      <fieldset
        disabled={loading || error !== null || importing}
        className="grid gap-5 md:grid-cols-2"
      >
        <legend className="sr-only">Destino de la importación</legend>

        <div>
          <label htmlFor="import-campaign" className="font-medium">
            Campaña
          </label>
          <select
            id="import-campaign"
            value={campaignId}
            onChange={event => setCampaignId(event.target.value)}
            className="mt-2 block w-full rounded-md border border-gray-300 bg-white p-3"
          >
            <option value="">Selecciona una campaña</option>
            {campaigns.map(campaign => (
              <option
                key={campaign.campaign_id}
                value={campaign.campaign_id}
              >
                {campaign.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="import-agent" className="font-medium">
            Agente responsable
          </label>
          <select
            id="import-agent"
            value={agentId}
            onChange={event => setAgentId(event.target.value)}
            className="mt-2 block w-full rounded-md border border-gray-300 bg-white p-3"
          >
            <option value="">Selecciona un agente</option>
            {agents.map(agent => (
              <option key={agent.user_id} value={agent.user_id}>
                {agent.full_name} ({agent.username})
              </option>
            ))}
          </select>
        </div>
      </fieldset>
            <div>
        <label htmlFor="import-file" className="font-medium">
            Archivo Excel
        </label>

        <input
            id="import-file"
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xlsm"
            disabled={loading || error !== null || importing}
            aria-describedby="import-file-help"
            className="mt-2 block w-full rounded-md border border-gray-300 p-3"
            onChange={event => {
            const selectedFile = event.target.files?.[0]

            setFile(null)
            setFileError(null)

            if (!selectedFile) return

            if (!/\.(xlsx|xlsm)$/i.test(selectedFile.name)) {
                setFileError('Selecciona un archivo .xlsx o .xlsm.')
                event.target.value = ''
                return
            }

            if (
                selectedFile.size === 0 ||
                selectedFile.size > 25 * 1024 * 1024
            ) {
                setFileError(
                'El archivo debe tener contenido y no superar 25 MB.'
                )
                event.target.value = ''
                return
            }

            setFile(selectedFile)
            }}
        />

        <p id="import-file-help" className="mt-2 text-sm text-gray-600">
            Se importará únicamente la hoja BASE. La primera fila debe
            incluir CLAVE, RAZON SOCIAL, TEL, CONTACTO y CORREO.
        </p>

        {fileError && (
            <p role="alert" className="mt-2 text-red-700">
            {fileError}
            </p>
        )}

        {file && (
            <p className="mt-2 text-sm text-gray-700">
            Archivo seleccionado: {file.name}
            {' · '}
            {(file.size / 1024).toFixed(1)} KB
            </p>
        )}
        </div>

      {!loading && !error && agents.length === 0 && (
        <p>No hay agentes activos disponibles.</p>
      )}

      {!loading && !error && campaigns.length === 0 && (
        <p>No hay campañas disponibles.</p>
      )}

        <button
        type="button"
        onClick={handleImport}
        disabled={
            loading ||
            importing ||
            error !== null ||
            fileError !== null ||
            !campaignId ||
            !agentId ||
            !file
        }
        className="rounded-md bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
        {importing ? 'Importando...' : 'Importar y asignar contactos'}
        </button>

        {importing && (
        <p role="status">
            Procesando el archivo. Espera el resultado antes de salir.
        </p>
        )}

        {importError && (
        <p role="alert" className="rounded-md bg-red-50 p-4 text-red-700">
            {importError}
        </p>
        )}

        {summary && (
        <div role="status" className="space-y-3 rounded-md border p-4">
            <h3 className="font-semibold">
            {summary.rowsProcessed === 0
                ? 'El archivo no contiene filas de datos'
                : summary.rejected === summary.rowsProcessed
                ? 'Todas las filas fueron rechazadas'
                : summary.rejected > 0
                    ? 'Importación completada con filas rechazadas'
                    : 'Importación completada'}
            </h3>

            <ul className="list-disc space-y-1 pl-5">
            <li>Filas procesadas: {summary.rowsProcessed}</li>
            <li>Importadas: {summary.imported}</li>
            <li>Duplicadas: {summary.duplicate}</li>
            <li>Rechazadas: {summary.rejected}</li>
            </ul>

            <p className="text-sm text-gray-600">
            Referencia de importación: {summary.importId}
            </p>

            {summary.rejected > 0 && (
            <p className="text-sm text-amber-800">
                Las filas rechazadas no se guardaron. Sus motivos quedaron
                registrados en la base de datos.
            </p>
            )}
        </div>
        )}

    </section>
  )
}