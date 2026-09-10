// No need for useAuth in the service file, removing the unused import

const API_BASE_URL = '/api'

export const api = {
  auth: {
    login: async (username: string, password: string) => {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Error al iniciar sesión')
      }

      return response.json()
    },
    logout: async () => {
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Error al cerrar sesión')
      }

      return response.json()
    },
    me: async () => {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Error al obtener la sesión')
      }

      return response.json()
    },
  },
  campaigns: {
    getAll: async () => {
      const response = await fetch(`${API_BASE_URL}/campaigns`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Error al obtener las campañas')
      }

      return response.json()
    },
  },
  catalogs: {
    getByCampaign: async (campaignId: number) => {
      const response = await fetch(
        `${API_BASE_URL}/catalogs?campaignId=${campaignId}`,
        {
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error('Error al obtener los catálogos')
      }

      return response.json()
    },
  },
  calls: {
    getOpen: async () => {
      const response = await fetch(`${API_BASE_URL}/calls/open`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Error al obtener el intento abierto')
      }

      return response.json()
    },
    create: async (callData: {
      idempotencyKey: string
      campaignId: number
      assignmentId: number
      clientId: number
      contactId: number | null
      dialedNumber: string
      dialedExtension: string | null
    }) => {
      const response = await fetch(`${API_BASE_URL}/calls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(callData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Error al crear la llamada')
      }

      return response.json()
    },
    close: async (attemptId: number, closeData: {
      channelCode: string
      notes?: string
      newData?: {
        phone?: string
        email?: string
        businessName?: string
      }
      survey?: {
        versionId: number
        declined: boolean
        answers?: {
          questionId: number
          optionId?: number
          answerText?: string
        }[]
      }
    }) => {
      const response = await fetch(
        `${API_BASE_URL}/calls/${attemptId}/close`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(closeData),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Error al cerrar la llamada')
      }

      return response.json()
    },
  },
  contacts: {
    import: async (
      file: File,
      campaignId: number,
      agentId: number
    ) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('campaignId', campaignId.toString())
      formData.append('agentId', agentId.toString())

      const response = await fetch(`${API_BASE_URL}/contacts/import`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Error al importar contactos')
      }

      return response.json()
    },
    getByClient: async (clientId: number, campaignId: number) => {
      const response = await fetch(
        `${API_BASE_URL}/contacts/${clientId}?campaignId=${campaignId}`,
        {
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error('Error al obtener el contacto')
      }

      return response.json()
    },
    getAvailable: async (campaignId: number, agentId: number | null = null) => {
      let url = `${API_BASE_URL}/contacts/available?campaignId=${campaignId}`
      if (agentId !== null) {
        url += `&agentId=${agentId}`
      }

      const response = await fetch(url, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Error al obtener los contactos disponibles')
      }

      return response.json()
    },
  },
  surveys: {
    getActiveVersion: async (campaignId: number) => {
      const response = await fetch(
        `${API_BASE_URL}/surveys/active-version?campaignId=${campaignId}`,
        {
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error('Error al obtener la versión activa de la encuesta')
      }

      return response.json()
    },
  },
  reports: {
    getMonthlyClosing: async (
      campaignId: number,
      year: number,
      month: number
    ) => {
      const response = await fetch(
        `${API_BASE_URL}/reports/monthly-closing?campaignId=${campaignId}&year=${year}&month=${month}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error('Error al generar el reporte mensual')
      }

      // Para archivos binarios como Excel, devolveremos el blob
      const blob = await response.blob()
      const filename =
        response.headers.get('content-disposition')?.split('filename=')[1]?.replace(
          /"/g,
          ''
        ) || 'reporte.xlsx'

      return { blob, filename }
    },
  },
  admin: {
    getUsers: async () => {
      const response = await fetch(`${API_BASE_URL}/admin/users`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Error al obtener los usuarios')
      }

      return response.json()
    },
    getPendingChannels: async () => {
      const response = await fetch(`${API_BASE_URL}/admin/catalogo-pendiente`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Error al obtener las canalizaciones pendientes')
      }

      return response.json()
    },
    classifyChannel: async (channelId: number, dispositionId: number) => {
      const response = await fetch(
        `${API_BASE_URL}/admin/canalizaciones/${channelId}/clasificar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ dispositionId }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Error al clasificar la canalización')
      }

      return response.json()
    },
    getBlacklist: async (campaignId: number | null = null) => {
      let url = `${API_BASE_URL}/admin/blacklist`
      if (campaignId !== null) {
        url += `?campaignId=${campaignId}`
      }

      const response = await fetch(url, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Error al obtener la lista negra')
      }

      return response.json()
    },
    releaseBlacklist: async (blacklistId: number) => {
      const response = await fetch(
        `${API_BASE_URL}/admin/blacklist/${blacklistId}/liberar`,
        {
          method: 'POST',
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error('Error al liberar de la lista negra')
      }

      return response.json()
    },
    createUser: async (userData: {
      username: string
      password: string
      fullName: string
      role: 'agent' | 'admin'
    }) => {
      const response = await fetch(`${API_BASE_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Error al crear el usuario')
      }

      return response.json()
    },
  },
}