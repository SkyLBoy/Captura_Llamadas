import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../services/api'
import PasswordInput from '../../components/ui/PasswordInput'
import { Button } from '../../components/ui/Button'
import { Feedback } from '../../components/ui/Feedback'
import { useConfirm } from '../../components/ui/ConfirmProvider'

export default function CreateUser() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const [data,setData] = useState({username:'',password:'',fullName:'',role:'agent' as 'agent'|'admin'})
  const [errors,setErrors] = useState<Record<string,string>>({})
  const [error,setError] = useState('')
  const [success,setSuccess] = useState('')
  const [busy,setBusy] = useState(false)
  const inFlight = useRef(false)
  if (user?.role !== 'admin') return <p>Acceso no autorizado.</p>
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    setError('');setSuccess('')
    const invalid: Record<string,string> = {}
    if (data.username.length < 3) invalid.username = 'Escribe al menos 3 caracteres.'
    if (data.password.length < 8) invalid.password = 'Usa al menos 8 caracteres.'
    if (!data.fullName.trim()) invalid.fullName = 'Escribe el nombre completo.'
    setErrors(invalid)
    if (Object.keys(invalid).length) { document.getElementById(Object.keys(invalid)[0])?.focus(); return }
    inFlight.current=true;setBusy(true)
    try {
      if (data.role === 'admin' && !await confirm({ title: 'Crear cuenta de administrador', message: `${data.fullName} tendrá acceso a los módulos de administración del sistema.`, action: 'Crear administrador' })) return
      await api.admin.createUser(data)
      setSuccess(`Usuario ${data.username} creado correctamente.`)
      setData({username:'',password:'',fullName:'',role:'agent'})
    } catch(error: unknown) { setError(error instanceof Error ? error.message : 'No se pudo crear el usuario.') }
    finally { inFlight.current=false;setBusy(false) }
  }
  const field = (name: 'username' | 'password' | 'fullName') => ({id:name,value:data[name],disabled:busy,required:true,'aria-invalid':Boolean(errors[name]),'aria-describedby':errors[name]?`${name}-error`:undefined,onChange:(e: React.ChangeEvent<HTMLInputElement>) => setData({...data,[name]:e.target.value})})
  return <section className="bg-surface rounded-lg shadow p-6"><div className="page-heading"><div className="eyebrow">Accesos del equipo</div><h1>Crear usuario</h1><p>Define los datos de acceso y el rol de la nueva cuenta.</p></div>{error && <Feedback tone="error">{error}</Feedback>}{success && <Feedback tone="success">{success} <Link to="/gestion/usuarios">Ver usuarios</Link></Feedback>}<form noValidate onSubmit={submit} className="space-y-4 max-w-xl">
    <div><label htmlFor="username">Usuario</label><input {...field('username')} minLength={3} autoComplete="off" className="block w-full mt-2" /><p id="username-error" className="question-error">{errors.username}</p></div>
    <div><label htmlFor="password">Contraseña</label><PasswordInput {...field('password')} minLength={8} autoComplete="new-password" className="block w-full mt-2" /><p id="password-error" className="question-error">{errors.password}</p></div>
    <div><label htmlFor="fullName">Nombre completo</label><input {...field('fullName')} autoComplete="off" className="block w-full mt-2" /><p id="fullName-error" className="question-error">{errors.fullName}</p></div>
    <div><label htmlFor="role">Rol</label><select id="role" disabled={busy} value={data.role} onChange={e => setData({...data,role:e.target.value as 'agent'|'admin'})} className="block w-full mt-2"><option value="agent">Agente</option><option value="admin">Administrador</option></select></div>
    <div className="call-actions"><Link to="/gestion/usuarios">Volver a usuarios</Link><Button intent="primary" type="submit" busy={busy}>Crear usuario</Button></div>
  </form></section>
}
