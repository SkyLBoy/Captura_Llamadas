import { Navigate } from 'react-router-dom'
import ContactList from '../pages/ContactList'
import MakeCall from '../pages/MakeCall'
import Dashboard from '../pages/Dashboard'
import ManagementDashboard from '../pages/ManagementDashboard'
import UserList from '../pages/admin/UserList'
import PendingChannels from '../pages/admin/PendingChannels'
import Blacklist from '../pages/admin/Blacklist'
import CreateUser from '../pages/admin/CreateUser'
import ImportContacts from '../pages/admin/ImportContacts'
import WorkRounds from '../pages/admin/WorkRounds'

const routes = [
  {
    path: '/',
    element: <Dashboard />,
    children: [
      {
        path: 'contactos',
        element: <ContactList />,
      },
      {
        path: 'llamar',
        element: <MakeCall />,
      },
    ],
  },
  {
    path: '/gestion',
    element: <ManagementDashboard />,
    children: [
      {
        path: 'usuarios',
        element: <UserList />,
      },
      {
        path: 'canalizaciones',
        element: <PendingChannels />,
      },
      {
        path: 'blacklist',
        element: <Blacklist />,
      },
      {
        path: 'crear-usuario',
        element: <CreateUser />,
      },
      {
        path: 'importar-contactos',
        element: <ImportContacts />,
      },
      {
        path: 'rondas',
        element: <WorkRounds />,
      }
    ],
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]

export default routes