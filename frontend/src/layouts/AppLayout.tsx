import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Nav from '../components/Nav'
import ThemeToggle from '../components/ui/ThemeToggle'

const titles: Record<string, string> = { '/contactos': 'Contactos de campaña', '/llamar': 'Mesa de llamada', '/gestion': 'Centro de gestión', '/gestion/usuarios': 'Usuarios', '/gestion/crear-usuario': 'Crear usuario', '/gestion/canalizaciones': 'Canalizaciones pendientes', '/gestion/blacklist': 'Lista negra', '/gestion/reportes': 'Reportes mensuales', '/gestion/rondas': 'Rondas de trabajo', '/gestion/importar-contactos': 'Importar contactos', '/gestion/contactos-finalizados': 'Contactos finalizados' }
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const title = pathname.endsWith('/historial') ? 'Historial diario' : pathname === '/gestion/reportes' ? 'Reportes y avances' : titles[pathname] || 'Captura de llamadas'
  useEffect(() => { document.title = `${title} · Vincco` }, [title])
  return <div className="app-shell"><a href="#main-content" className="skip-link">Ir al contenido</a><header className="app-header">
    <div className="app-brand"><img src="/vincco-logo.png" alt="Vincco, centro de contacto" width="136" height="76" /><span>{title}</span></div>
    <div className="header-tools"><div className="signed-user"><strong>{user?.fullName || user?.username}</strong><small>{user?.role === 'admin' ? 'Administración' : 'Agente'}</small></div><ThemeToggle /></div>
  </header><nav className="app-nav" aria-label="Navegación principal"><Nav user={user} /></nav>
  <main id="main-content" className="app-main" tabIndex={-1}>{children}</main><footer className="app-footer"><span>VINCCO / CENTRO DE CONTACTO</span><span>PARTNER DELL · SILIMEX</span></footer></div>
}
