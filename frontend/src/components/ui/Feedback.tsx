import type { ReactNode } from 'react'
export function Feedback({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'warning' | 'success' }) {
  return <div className={`feedback feedback--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
}
