import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import AdminLayout from '../layouts/AdminLayout'
const modules = [
  ['historial', 'Historial diario', 'Revisa las llamadas del día y filtra por agente o campaña.'],
  ['contactos-finalizados', 'Contactos finalizados', 'Consulta los resultados exitosos y las encuestas contestadas.'],
  ['reportes', 'Reportes y avances', 'Descarga el avance del mes o consulta un periodo anterior en Excel.'],
  ['rondas', 'Rondas de trabajo', 'Consulta bases, revisa el historial y prepara la siguiente ronda.'],
  ['importar-contactos', 'Importar contactos', 'Carga una base y asígnala al agente correspondiente.'],
  ['usuarios', 'Usuarios', 'Gestiona los accesos de agentes y administradores.'],
  ['canalizaciones', 'Canalizaciones', 'Asigna una disposición a las canalizaciones pendientes.'],
  ['blacklist', 'Lista negra', 'Consulta los contactos excluidos de la operación.'],
  ['crear-usuario', 'Crear usuario', 'Registra una nueva cuenta y define su rol.'],
]
export default function ManagementDashboard() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  if (user?.role !== 'admin') return <p>Acceso no autorizado</p>
  return <AdminLayout>{pathname === '/gestion' || pathname === '/gestion/' ? <><div className="page-heading"><div className="eyebrow">Centro de gestión</div><h1>La operación, en perspectiva.</h1><p>Administra las campañas y acompaña el trabajo de tu equipo.</p></div><div className="management-grid">{modules.map(([route,title,description]) => <NavLink className="management-link" to={`/gestion/${route}`} key={route}><div><h2>{title}</h2><p>{description}</p></div><span aria-hidden="true">↗</span></NavLink>)}</div></> : <Outlet />}</AdminLayout>
}
