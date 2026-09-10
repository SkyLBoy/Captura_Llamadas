import { useState, useCallback } from 'react'

export const useApi = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const executeApiCall = useCallback(
    async <T>(apiCall: () => Promise<T>): Promise<T | null> => {
      setLoading(true)
      setError(null)
      try {
        const result = await apiCall()
        setLoading(false)
        return result
      } catch (err: any) {
        setLoading(false)
        setError(err.message || 'Error desconocido')
        return null
      }
    },
    []
  )

  return { loading, error, executeApiCall, setError }
}