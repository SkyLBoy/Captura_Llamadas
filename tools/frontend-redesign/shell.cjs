const fs=require('node:fs');
for(const name of ['AgentLayout','AdminLayout'])fs.writeFileSync(`frontend/src/layouts/${name}.tsx`,"export { default } from './AppLayout'\n");
fs.writeFileSync('frontend/src/components/Nav.tsx',`import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useConfirm } from './ui/ConfirmProvider'
import { useState } from 'react'
export const adminLinks = [
  ['/gestion', 'Resumen'], ['/gestion/contactos-finalizados', 'Finalizados'], ['/gestion/reportes', 'Reportes'], ['/gestion/rondas', 'Rondas de trabajo'], ['/gestion/importar-contactos', 'Importar contactos'], ['/gestion/usuarios', 'Usuarios'], ['/gestion/canalizaciones', 'Canalizaciones'], ['/gestion/blacklist', 'Lista negra'],
]
export default function Nav({ user }: { user: { role: string } | null }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  if (!user) return null
  const links = user.role === 'admin' ? adminLinks : [['/contactos', 'Contactos de campaña'], ['/llamar', 'Mesa de llamada']]
  return <><div className="nav-links">{links.map(([to,label]) => <NavLink key={to} to={to} end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>{label}</NavLink>)}</div><button className="logout-button" disabled={busy} onClick={async () => {
    if (!await confirm({ title: 'Cerrar sesión', message: 'Si tienes una llamada abierta, seguirá abierta y podrás recuperarla al volver a ingresar.', action: 'Cerrar sesión' })) return
    setBusy(true)
    await logout()
    navigate('/login', { replace: true })
  }}>Cerrar sesión</button></>
}
`);
let app=fs.readFileSync('frontend/src/App.tsx','utf8').replace("import Login", "import { ConfirmProvider } from './components/ui/ConfirmProvider'\nimport Login");
app=app.replace('<AuthProvider>', '<ConfirmProvider><AuthProvider>').replace('</AuthProvider>','</AuthProvider></ConfirmProvider>');fs.writeFileSync('frontend/src/App.tsx',app);
let html=fs.readFileSync('frontend/index.html','utf8').replace('type="image/svg+xml" href="/vite.svg"','type="image/x-icon" href="/vincco-icono.ico"').replace('<title>Captura de llamadas</title>','<title>Captura de llamadas · Vincco</title>\n    <script src="/theme-init.js"></script>');fs.writeFileSync('frontend/index.html',html);
fs.writeFileSync('frontend/public/theme-init.js',`try { const theme = localStorage.getItem('vincco-theme'); document.documentElement.dataset.theme = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light' } catch { document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' }\n`);
// Existing screen recipes retain their semantic roles and all event handlers.
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(dir+'/'+e.name):[dir+'/'+e.name])}
for(const p of files('frontend/src/pages').filter(p=>p.endsWith('.tsx'))){let s=fs.readFileSync(p,'utf8');s=s.replace(/\bbg-white\b/g,'bg-surface').replace(/<form\b/g,'<form noValidate').replace(/<textarea\b/g,'<textarea style={{ resize: \'none\' }}');fs.writeFileSync(p,s)}
