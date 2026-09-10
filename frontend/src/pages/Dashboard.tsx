import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Outlet } from 'react-router-dom'
import AgentLayout from '../layouts/AgentLayout'
import AdminLayout from '../layouts/AdminLayout'

const Dashboard: React.FC = () => {
  const { user } = useAuth()

  if (!user) {
    return <div>Cargando...</div>
  }

  return user.role === 'admin' ? (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  ) : (
    <AgentLayout>
      <Outlet />
    </AgentLayout>
  )
}

export default Dashboard