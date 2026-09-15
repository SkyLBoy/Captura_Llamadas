import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme === 'dark')
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return <button type="button" className="theme-toggle" aria-pressed={dark} onClick={() => {
    const next = !dark
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    try { localStorage.setItem('vincco-theme', next ? 'dark' : 'light') } catch { /* Theme still works in memory. */ }
    setDark(next)
  }}><span aria-hidden="true">{dark ? '☀' : '☾'}</span> {dark ? 'Modo claro' : 'Modo oscuro'}</button>
}
