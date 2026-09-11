import { api } from '../services/api'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface AuthContextType {
  user: {
    id: number
    username: string
    fullName: string
    role: string
  } | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthContextType['user']>(null)
  const [isLoading, setIsLoading] = useState(true)

  const login = async (username: string, password: string) => {
    const data = await api.auth.login(username, password)
    try {
      sessionStorage.removeItem(`selectedCampaign:${data.user.id}`)
    } catch {
      // Ignored
    }
    setUser(data.user)
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      try{
        if(user) {
          sessionStorage.removeItem(`selectedCampaign:${user.id}`)
        }
      } catch {
        // Ignored
      }
      setUser(null)
    }
  }

  const checkAuth = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        setUser({ ...data.user, id: data.user.id ?? data.user.userId })
      } else {
        setUser(null)
      }
    } catch (error) {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  if (isLoading) {
    return null
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, logout, checkAuth }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider')
  }
  return context
}