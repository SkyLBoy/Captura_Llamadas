import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface NavProps {
  user: {
    id: number
    username: string
    fullName: string
    role: string
  } | null
}

const Nav: React.FC<NavProps> = ({ user }) => {
  const { logout } = useAuth()
  if (!user) return null

  const isAgent = user.role === 'agent'
  const isAdmin = user.role === 'admin'

  return (
    <>
      <NavLink
        to={isAgent ? '/contactos' : '/gestion'}
        end
        className={({ isActive }: { isActive: boolean }) =>
          `rounded-md px-3 py-2 text-sm font-medium ${
            isActive
              ? 'bg-white text-indigo-600 ring-1 ring-inset ring-indigo-600'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        aria-current="page"
      >
        {isAgent ? 'Mis Contactos' : 'Gestión'}
      </NavLink>

      {isAdmin && (
        <>
          <NavLink
            to="/gestion/usuarios"
            className={({ isActive }: { isActive: boolean }) =>
              `rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? 'bg-white text-indigo-600 ring-1 ring-inset ring-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            aria-current="page"
          >
            Usuarios
          </NavLink>

          <NavLink
            to="/gestion/canalizaciones"
            className={({ isActive }: { isActive: boolean }) =>
              `rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? 'bg-white text-indigo-600 ring-1 ring-inset ring-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            aria-current="page"
          >
            Canalizaciones
          </NavLink>

          <NavLink
            to="/gestion/blacklist"
            className={({ isActive }: { isActive: boolean }) =>
              `rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? 'bg-white text-indigo-600 ring-1 ring-inset ring-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            aria-current="page"
          >
            Lista Negra
          </NavLink>
        </>
      )}

      <button
        onClick={async () => {
          await logout()
          window.location.href = '/login'
        }}
        className="ml-4 flex h-9 items-center px-3 justify-center text-sm font-medium transition-colors
                   text-gray-500 bg-white border border-gray-300 rounded-md hover:text-gray-800 hover:bg-gray-50"
      >
        Cerrar sesión
      </button>
    </>
  )
}

export default Nav