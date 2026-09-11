// No need for useAuth in the service file, removing the unused import

const API_BASE_URL = '/api'

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function getErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const data = await response.json()
    const message = data?.error?.message ?? data?.message

    return typeof message === 'string' && message.trim()
      ? message
      : fallback
  } catch {
    return fallback
  }
}

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
          throw new Error(
            await getErrorMessage(response, 'Error al iniciar sesión')
          )
        }

      return response.json()
    },
    logout: async () => {
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, 'Error al cerrar sesión')
        )
      }

      return response.json()
    },
    me: async () => {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, 'Error al obtener la sesión')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al obtener las campañas')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al obtener los catálogos')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al obtener el intento abierto')
        )
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
      dialedExtension?: string
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
        throw new ApiError(response.status,
          await getErrorMessage(response, 'Error al crear la llamada')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al cerrar la llamada')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al importar contactos')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al obtener el contacto')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al obtener los contactos disponibles')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al obtener la versión activa de la encuesta')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al generar el reporte mensual')
        )
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
    getRoundHistory: async (campaignId: number, agentId: number) => {
  const response = await fetch(
    `${API_BASE_URL}/admin/rondas/historial?campaignId=${campaignId}&agentId=${agentId}`,
    {
      credentials: 'include',
    }
  )

        if (!response.ok) {
          throw new Error(
            await getErrorMessage(
              response,
              'Error al consultar el historial de rondas'
            )
          )
        }

      return response.json() as Promise<{
        rounds: {
          round_id: number
          name: string
          started_at: string
          ended_at: string | null
        }[]
      }>
    },
      getRoundSummary: async (campaignId: number, agentId: number) => {
        const response = await fetch(
        `${API_BASE_URL}/admin/rondas/resumen?campaignId=${campaignId}&agentId=${agentId}`,
        {
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, 'Error al consultar la ronda')
        )
      }

      return response.json() as Promise<{
        round: {
          round_id: number
          name: string
          started_at: string
          ended_at: string | null
        } | null
        summary: {
          assigned: number
          blocked: number
          inactive: number
          eligible: number
        }
        hasOpenCall: boolean
      }>
    },

    startRound: async (data: {
      campaignId: number
      agentId: number
      name: string
      expectedRoundId: number | null
    }) => {
      const response = await fetch(`${API_BASE_URL}/admin/rondas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, 'Error al habilitar la ronda')
        )
      }

      return response.json() as Promise<{
        round: {
          round_id: number
          name: string
        }
        enabledContacts: number
      }>
    },
      getUsers: async () => {
        const response = await fetch(`${API_BASE_URL}/admin/users`, {
          credentials: 'include',
        })

        if (!response.ok) {
          throw new Error(
            await getErrorMessage(response, 'Error al obtener los usuarios')
          )
        }

      return response.json()
    },
    getPendingChannels: async () => {
      const response = await fetch(`${API_BASE_URL}/admin/catalogo-pendiente`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, 'Error al obtener las canalizaciones pendientes')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al clasificar la canalización')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al obtener la lista negra')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al liberar de la lista negra')
        )
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
        throw new Error(
          await getErrorMessage(response, 'Error al crear el usuario')
        )
      }

      return response.json()
    },
  },
}
