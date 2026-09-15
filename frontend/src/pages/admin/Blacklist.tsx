import React, { useState, useEffect } from 'react'
import { useConfirm } from '../../components/ui/ConfirmProvider'
import { useAuth } from '../../contexts/AuthContext'
import { useApi } from '../../hooks/useApi'
import { api } from '../../services/api'

const Blacklist: React.FC = () => {
  const { user } = useAuth()
  const confirm = useConfirm()
  const { loading, error, executeApiCall } = useApi()
  const [blacklist, setBlacklist] = useState<Array<any>>([])
  const [campaigns, setCampaigns] = useState<
    Array<{ campaign_id: number; name: string }>>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null)

  useEffect(() => {
    if (user && user.role === 'admin') {
      loadCampaigns()
      loadBlacklist()
    }
  }, [user])

  const loadCampaigns = async () => {
    const result = await executeApiCall(() => api.campaigns.getAll())
    if (result) {
      setCampaigns(result.campaigns || [])
    }
  }

  const loadBlacklist = async (
    campaignId: number | null = selectedCampaignId
  ) => {
    const result = await executeApiCall(() =>
      api.admin.getBlacklist(campaignId)
    )

    if (result) {
      setBlacklist(result.blacklist || [])
    }
  }

  const handleRelease = async (blacklistId: number) => {
    const item = blacklist.find(item => item.blacklist_id === blacklistId)
    if (!await confirm({ title: 'Liberar contacto de Blacklist', message: `Se retirará el bloqueo de ${item?.razon_social || item?.clave || 'este contacto'}. Los demás criterios de elegibilidad de la campaña siguen aplicando.`, action: 'Liberar contacto' })) return
    const result = await executeApiCall(() =>
      api.admin.releaseBlacklist(blacklistId)
    )

    if (result) {
      await loadBlacklist()
    }
  }

const handleCampaignChange = async (
  e: React.ChangeEvent<HTMLSelectElement>
) => {
  const value = e.target.value
  const campaignId = value === '' ? null : Number(value)

  setSelectedCampaignId(campaignId)
  await loadBlacklist(campaignId)
}
  if (loading && !blacklist.length && !campaigns.length) {
    return <div className="text-center py-8">Cargando...</div>
  }
  if (error) {
    return (
      <div
        role="alert"
        className="bg-red-50 text-red-700 p-4 rounded mb-6"
      >
        <p>{error}</p>

        <button
          type="button"
          onClick={async () => {
            await loadCampaigns()
            await loadBlacklist()
          }}
          disabled={loading}
          className="mt-3 rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Reintentando...' : 'Reintentar'}
        </button>
      </div>
    )
  }

  if (!user || user.role !== 'admin') {
    return <div className="text-center py-8">Acceso no autorizado</div>
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Lista Negra de Contactos</h2>
        <div className="mb-4">
          <label htmlFor="campaign-select" className="block text-sm font-medium text-gray-700 mb-2">
            Filtrar por campaña
          </label>
          <select
            id="campaign-select"
            value={selectedCampaignId || ''}
            onChange={handleCampaignChange}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          >
            <option value="">Todas las campañas</option>
            {campaigns.map((campaign) => (
              <option key={campaign.campaign_id} value={campaign.campaign_id}>
                {campaign.name}
                </option>
            ))}
          </select>
        </div>

        {blacklist.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Clave
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Razón Social
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campaña
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Razón del Bloqueo
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha de Inicio
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-gray-200">
                {blacklist.map((item: any) => (
                  <tr key={item.blacklist_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.clave}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.razon_social}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {campaigns.find(c => c.campaign_id === item.campaign_id)?.name ?? 'Campaña no disponible'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.reason || 'Sin razón especificada'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.started_at 
                      ? new Date(item.started_at).toLocaleDateString('es-MX', {
                        timeZone: 'America/Hermosillo',
                      }) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        disabled={loading}
                        onClick={() => handleRelease(item.blacklist_id)}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Liberar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center py-8 text-gray-500">
            No hay contactos en la lista negra
          </p>
        )}
      </div>
    </div>
  )
}

export default Blacklist