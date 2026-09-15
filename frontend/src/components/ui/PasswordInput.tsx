import { useState, type InputHTMLAttributes } from 'react'
export default function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false)
  return <div className="password-field"><input {...props} type={visible ? 'text' : 'password'} /><button type="button" aria-controls={props.id} aria-pressed={visible} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible(!visible)}>{visible ? 'Ocultar' : 'Mostrar'}</button></div>
}
