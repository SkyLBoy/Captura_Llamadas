import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'

const ContactList: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { loading, error, executeApiCall } = useApi()
  const [campaigns, setCampaigns] = useState<
    Array<{ campaign_id: number; name: string }>>([])

  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null)
  const [contacts, setContacts] = useState<Array<any>>([]) // from vw_contactos_disponibles
  const [searchTerm, setSearchTerm] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
 

  // Redirect admins to management dashboard
  useEffect(() => {
    if (user && user.role === 'admin') {
      navigate('/gestion', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    if (user && user.role === 'agent') {
      loadCampaigns()
    }
  }, [user])

  const loadCampaigns = async () => {
    const result = await executeApiCall(() => api.campaigns.getAll())
    if (result) {
      setCampaigns(result.campaigns || [])
    }
  }

  const loadAvailableContacts = async (campaignId: number) => {
  if (!user || user.role !== 'agent') return

  const result = await executeApiCall(() =>
    api.contacts.getAvailable(campaignId)
  )

  if (result) {
    setContacts(result.contacts || [])
  }
}

  const handleCampaignChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const campaignId = parseInt(e.target.value)
    setSelectedCampaignId(campaignId)
    setSearchTerm('')
    setLoadingDetail(false)
    setContacts([])

    if (campaignId && user && user.role === 'agent') {
      loadAvailableContacts(campaignId)
    }
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
  }

  const filteredContacts = contacts.filter(contact => {
    const term = searchTerm.toLowerCase()
    return (
      contact.clave.toLowerCase().includes(term) ||
      (contact.razon_social?.toLowerCase().includes(term) ?? false)
    )
  })

  // Instead of showing a detail modal, we navigate to MakeCall when user selects a contact to call
  const handleCallContact = async (contact: any) => {
    navigate('/llamar', {
      state: {
        campaignId: selectedCampaignId,
        clientId: contact.client_id,
        assignmentId: contact.assignment_id
      }
    })
  }

  if (loading && !campaigns.length) {
    return <div className="text-center py-8">Cargando...</div>
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-500 p-4 rounded mb-6">
        {error}
      </div>
    )
  }

  // If user is not an agent (should have been redirected, but just in case)
  if (!user || user.role !== 'agent') {
    return <div className="text-center py-8">Esta página es solo para agentes.</div>
  }

  return (
    <div className="space-y-6">
      {/* Campaign Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Seleccione una campaña</h2>
        <div className="mb-4">
          <label htmlFor="campaign-select" className="block text-sm font-medium text-gray-700 mb-2">
            Campaña
          </label>
          <select
            id="campaign-select"
            value={selectedCampaignId || ''}
            onChange={handleCampaignChange}
            disabled={loading}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          >
            <option value="">Seleccione una campaña</option>
            {campaigns.map((campaign) => (
              <option key={campaign.campaign_id} value={campaign.campaign_id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Search and Contacts List */}
      {selectedCampaignId && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold mb-0">Contactos disponibles</h2>
              <input
                type="text"
                placeholder="Buscar por clave o razón social"
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-3 pr-10 py-2 text-base border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm w-64"
              />
            </div>

            {filteredContacts.length > 0 ? (
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
                        Sucursal
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredContacts.map((contact) => (
                      <tr key={contact.client_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {contact.clave}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {contact.razon_social || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {contact.sucursal || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleCallContact(contact)}
                            disabled={loadingDetail}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Llamar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-8 text-gray-500">
                No hay contactos disponibles para esta campaña con el filtro actual
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default ContactList