import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useConfirm } from './ui/ConfirmProvider'
import { useState } from 'react'
export const adminLinks = [
  ['/gestion/historial', 'Historial diario'],
  ['/gestion', 'Resumen'], ['/gestion/contactos-finalizados', 'Finalizados'], ['/gestion/reportes', 'Reportes'], ['/gestion/rondas', 'Rondas de trabajo'], ['/gestion/importar-contactos', 'Importar contactos'], ['/gestion/usuarios', 'Usuarios'], ['/gestion/canalizaciones', 'Canalizaciones'], ['/gestion/blacklist', 'Lista negra'],
]
export default function Nav({ user }: { user: { role: string } | null }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  if (!user) return null
  const links = user.role === 'admin' ? adminLinks : [['/contactos', 'Contactos de campaña'], ['/llamar', 'Mesa de llamada'], ['/historial', 'Historial diario']]
  return <><div className="nav-links">{links.map(([to,label]) => <NavLink key={to} to={to} end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>{label}</NavLink>)}</div><button className="logout-button" disabled={busy} onClick={async () => {
    if (!await confirm({ title: 'Cerrar sesión', message: 'Si tienes una llamada abierta, seguirá abierta y podrás recuperarla al volver a ingresar.', action: 'Cerrar sesión' })) return
    setBusy(true)
    await logout()
    navigate('/login', { replace: true })
  }}>Cerrar sesión</button></>
}
