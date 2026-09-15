import type { ButtonHTMLAttributes } from 'react'
export function Button({ busy, intent = 'neutral', className = '', children, disabled, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; intent?: 'primary' | 'neutral' | 'danger' }) {
  return <button {...props} type={type} disabled={disabled || busy} aria-busy={busy || undefined} className={`v-button v-button--${intent} ${className}`}><span>{children}</span>{busy && <span aria-hidden="true" className="button-spinner" />}</button>
}
