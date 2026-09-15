import { useRef, type InputHTMLAttributes } from 'react'
export default function SearchInput({ value, onClear, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { onClear: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return <div className="search-field"><input {...props} ref={ref} value={value} type="search" className={className} />{value && <button type="button" aria-label="Limpiar búsqueda" onClick={() => { onClear(); ref.current?.focus() }}>×</button>}</div>
}
