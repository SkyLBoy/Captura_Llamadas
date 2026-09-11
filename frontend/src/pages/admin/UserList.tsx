import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useApi } from '../../hooks/useApi'
import { api } from '../../services/api'
import { Link } from 'react-router-dom'

const UserList: React.FC = () => {
  const { user } = useAuth()
  const { loading, error, executeApiCall } = useApi()
  const [users, setUsers] = useState<Array<any>>([])

  useEffect(() => {
    if (user && user.role === 'admin') {
      loadUsers()
    }
  }, [user])

  const loadUsers = async () => {
    const result = await executeApiCall(() => api.admin.getUsers())
    if (result) {
      setUsers(result.users || [])
    }
  }

  if (loading && !users.length) {
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
        <div className= "mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Gestión de Usuarios</h2>
            <Link
              to="/gestion/crear-usuario"
              className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
            >
              Crear Usuario
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre Completo
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rol
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length > 0 ? (
                users.map((userItem: any) => (
                  <tr key={userItem.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {userItem.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {userItem.full_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        userItem.role === 'admin'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {userItem.role === 'admin' ? 'Administrador' : 'Agente'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        userItem.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {userItem.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {/* Aquí irían los botones de editar/eliminar */}
                      <button
                        className="text-indigo-600 hover:text-indigo-900 mr-2"
                        disabled={userItem.user_id === user.id}
                      >
                        Editar
                      </button>
                      {!userItem.is_active && (
                        <button className="text-green-600 hover:text-green-900">
                          Activar
                        </button>
                      )}
                      {userItem.is_active && userItem.user_id !== user.id && (
                        <button className="text-red-600 hover:text-red-900">
                          Desactivar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No hay usuarios registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
  )
}

export default UserList