import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useApi } from '../../hooks/useApi'
import { api } from '../../services/api'

type Disposition = {
  disposition_id: number
  campaign_id: number
  code: string
  description: string
}

const PendingChannels: React.FC = () => {
  const { user } = useAuth()
  const { loading, error, executeApiCall } = useApi()
  const [pendingChannels, setPendingChannels] = useState<Array<any>>([])
  const [dispositions, setDispositions] = useState<Disposition[]>([])
  const [selectedDispositions, setSelectedDispositions] = useState<Record<number, number | null>>({})
  const [savingChannelId, setSavingChannelId] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  
  useEffect(() => {
    if (user && user.role === 'admin') {
      loadPendingChannels()
      loadDispositions()
    }
  }, [user])

  const loadPendingChannels = async () => {
    const result = await executeApiCall(() => api.admin.getPendingChannels())
    if (result) {
      setPendingChannels(result.pendientes || [])
    }
  }

const loadDispositions = async () => {
  const result = await executeApiCall(async () => {
    const response = await api.campaigns.getAll()

    const campaigns: Array<{ campaign_id: number }> =
      response.campaigns

    const catalogs = await Promise.all(
      campaigns.map(campaign =>
        api.catalogs.getByCampaign(campaign.campaign_id)
      )
    )

    return catalogs.flatMap(
      (catalog): Disposition[] => catalog.dispositions
    )
  })

  if (result) {
    setDispositions(result)
  }
}

  
const handleClassify = async (
  channelId: number,
  campaignId: number
) => {
  if (savingChannelId !== null) return

  setSaveError(null)

  const dispositionId = selectedDispositions[channelId]

  const validDisposition = dispositions.some(
    disposition =>
      disposition.disposition_id === dispositionId &&
      disposition.campaign_id === campaignId
  )

  if (!dispositionId || !validDisposition) {
    setSaveError('Selecciona una disposición de la campaña correspondiente.')
    return
  }

  setSavingChannelId(channelId)

  try {
    const result = await api.admin.classifyChannel(
      channelId,
      dispositionId
    )

    if (!result.ok) {
      throw new Error('El servidor no confirmó el guardado.')
    }

    setPendingChannels(previous =>
      previous.filter(channel => channel.channel_id !== channelId)
    )

    setSelectedDispositions(previous => {
      const updated = { ...previous }
      delete updated[channelId]
      return updated
    })
  } catch (error) {
    setSaveError(
      error instanceof Error
        ? error.message
        : 'No se pudo guardar la clasificación.'
    )
  } finally {
    setSavingChannelId(null)
  }
}

  if (loading && !pendingChannels.length) {
    return <div className="text-center py-8">Cargando...</div>
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-500 p-4 rounded mb-6">
        {error}
      </div>
    )
  }

  if (!user || user.role !== 'admin') {
    return <div className="text-center py-8">Acceso no autorizado</div>
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Canalizaciones Pendientes</h2>
        {saveError && (
          <div role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {saveError}
          </div>
        )}
        <p className="mb-4 text-gray-600">
          Estas canalizaciones todavía no están disponibles para los agentes.
          Asigna una disposición para habilitarlas en su campaña.
        </p>

        {pendingChannels.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campaña
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Código
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Disposición
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingChannels.map((channel: any) => (
                  <tr key={channel.channel_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {channel.campaign}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {channel.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {channel.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <select
                      value={selectedDispositions[channel.channel_id] ?? ''}
                      onChange={event => {
                        const value = event.target.value

                        setSelectedDispositions(previous => ({
                          ...previous,
                          [channel.channel_id]: value === '' ? null : Number(value),
                        }))
                      }}
                      disabled={savingChannelId !== null}
                      aria-label={`Disposición para ${channel.code} de ${channel.campaign}`}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Seleccione una disposición</option>
                        {dispositions
                          .filter(disp => disp.campaign_id === channel.campaign_id)
                          .map(disp => (
                            <option
                              key={disp.disposition_id}
                              value={disp.disposition_id}
                            >
                              {disp.code} - {disp.description}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() =>
                          handleClassify(channel.channel_id, channel.campaign_id)
                        }
                        disabled={
                          savingChannelId !== null ||
                          !selectedDispositions[channel.channel_id]
                        }
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        {savingChannelId === channel.channel_id
                          ? 'Guardando...'
                          : 'Clasificar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center py-8 text-gray-500">
            No hay canalizaciones pendientes de clasificación
          </p>
        )}
      </div>
    </div>
  )
}

export default PendingChannels