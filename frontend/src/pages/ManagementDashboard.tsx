import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavLink, Outlet } from 'react-router-dom'
import AdminLayout from '../layouts/AdminLayout'


const ManagementDashboard: React.FC = () => {
  const { user } = useAuth()

  if (!user || user.role !== 'admin') {
    return <div>Acceso no autorizado</div>
  }

  return (
    <AdminLayout>
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Panel de Administración</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <NavLink
            to="/gestion/rondas"
            className="flex h-32 items-center justify-center rounded-lg bg-white shadow text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">Rondas de Trabajo</div>
              <div className="text-sm text-gray-500">Consultar bases y preparar la siguiente ronda</div>
            </div>
          </NavLink>
          <NavLink
            to="/gestion/importar-contactos"
            className="flex h-32 items-center justify-center rounded-lg bg-white shadow text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">
                Importar Contactos
                </div>
              <div className="text-sm text-gray-500">
                Cargar una base y asignarla a un agente
              </div>
            </div>
          </NavLink>
          <NavLink
            to="/gestion/usuarios"
            className="block h-32 bg-white rounded-lg shadow flex items-center justify-center
                   text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">Usuarios</div>
              <div className="text-sm text-gray-500">Gestionar agentes y administradores</div>
            </div>
          </NavLink>

          <NavLink
            to="/gestion/canalizaciones"
            className="block h-32 bg-white rounded-lg shadow flex items-center justify-center
                   text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">Canalizaciones</div>
              <div className="text-sm text-gray-500">Clasificar canalizaciones pendientes</div>
            </div>
          </NavLink>

          <NavLink
            to="/gestion/blacklist"
            className="block h-32 bg-white rounded-lg shadow flex items-center justify-center
                   text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">Lista Negra</div>
              <div className="text-sm text-gray-500">Gestionar contactos bloqueados</div>
            </div>
          </NavLink>
        </div>
      </div>
    <Outlet />
  </div>
</AdminLayout>
  )
}

export default ManagementDashboard