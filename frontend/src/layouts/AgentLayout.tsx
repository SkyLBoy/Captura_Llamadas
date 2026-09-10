import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import Nav from '../components/Nav'

const AgentLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <img
                  className="h-8 w-auto"
                  src="https://via.placeholder.com/40"
                  alt="Logo"
                />
              </div>
              <div className="hidden md:ml-6 md:flex md:space-x-8">
                <Nav user={user} />
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-700">
                Bienvenido, {user?.fullName}
              </span>
            </div>
          </div>
        </div>
      </header>
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}

export default AgentLayout