import React, { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useApi } from '../../hooks/useApi'
import { api } from '../../services/api'

const CreateUser: React.FC = () => {
  const { user } = useAuth()
  const { loading, error, executeApiCall } = useApi()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    role: 'agent' as 'agent' | 'admin',
  })
  const [success, setSuccess] = useState(false)

  if (!user || user.role !== 'admin') {
    return <div className="text-center py-8">Acceso no autorizado</div>
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await executeApiCall(() => api.admin.createUser(formData))
      setSuccess(true)
      // Limpiar formulario después de éxito
      setFormData({
        username: '',
        password: '',
        fullName: '',
        role: 'agent',
      })
    } catch (err: any) {
      // El error ya se maneja en executeApiCall
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Crear Nuevo Usuario</h2>
        {success && (
          <div className="bg-green-50 border-l-4 border-green-500 text-green-700 p-4 mb-4">
            Usuario creado correctamente
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              Usuario
            </label>
            <input
              type="text"
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              minLength={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <input
              type="password"
              id="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={8}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
              Nombre Completo
            </label>
            <input
              type="text"
              id="fullName"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
              Rol
            </label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as 'agent' | 'admin' })}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="agent">Agente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {loading ? 'Creando usuario...' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateUser