import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import ThemeToggle from '../components/ui/ThemeToggle'
import PasswordInput from '../components/ui/PasswordInput'
import { Button } from '../components/ui/Button'
import { Feedback } from '../components/ui/Feedback'
export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username,setUsername] = useState('')
  const [password,setPassword] = useState('')
  const [error,setError] = useState<string | null>(null)
  const [loading,setLoading] = useState(false)
  const inFlight = useRef(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { document.title = 'Iniciar sesión · Vincco' }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    setError(null)
    if (!username.trim() || !password) { setError('Escribe tu usuario y contraseña.'); if (!username.trim()) usernameRef.current?.focus(); else document.getElementById('password')?.focus(); return }
    inFlight.current=true;setLoading(true)
    try { await login(username,password); navigate('/',{replace:true}) }
    catch(error: unknown) { setError(error instanceof Error ? error.message : 'No se pudo iniciar sesión.') }
    finally { inFlight.current=false;setLoading(false) }
  }
  return <div className="login-shell"><section className="login-story"><img src="/vincco-logo.png" alt="Vincco, centro de contacto" width="200" height="130" /><h1>Cada conversación<br />empieza contigo.</h1><p>Tu espacio de trabajo para conectar, escuchar y dar seguimiento.</p><p>PARTNER DELL / SILIMEX</p></section><main className="login-form-wrap"><ThemeToggle /><form noValidate className="login-form" onSubmit={submit}><div className="eyebrow">Bienvenido a Vincco</div><h2>Iniciar sesión</h2><p className="small">Ingresa con tu cuenta de trabajo.</p>{error && <Feedback tone="error">{error}</Feedback>}<label htmlFor="username">Usuario</label><input ref={usernameRef} id="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required disabled={loading} /><label htmlFor="password">Contraseña</label><PasswordInput id="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={loading} /><Button type="submit" intent="primary" busy={loading}>Iniciar sesión</Button><p className="small">VINCCO · Centro de contacto</p></form></main></div>
}
