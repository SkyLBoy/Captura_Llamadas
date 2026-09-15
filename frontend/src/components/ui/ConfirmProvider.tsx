import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
type Request = { title: string; message: string; action: string; danger?: boolean }
const Context = createContext<(request: Request) => Promise<boolean>>(async () => false)
export const useConfirm = () => useContext(Context)
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null)
  const resolve = useRef<((value: boolean) => void) | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const origin = useRef<HTMLElement | null>(null)
  const finish = (value: boolean) => {
    dialog.current?.close()
    setRequest(null)
    resolve.current?.(value)
    resolve.current = null
    origin.current?.focus()
  }
  useEffect(() => { if (request) { dialog.current?.showModal(); cancel.current?.focus() } }, [request])
  useEffect(() => () => { resolve.current?.(false) }, [])
  return <Context.Provider value={next => {
    if (resolve.current) return Promise.resolve(false)
    origin.current = document.activeElement as HTMLElement
    setRequest(next)
    return new Promise<boolean>(done => { resolve.current = done })
  }}>{children}<dialog ref={dialog} className="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-message" onCancel={event => { event.preventDefault(); finish(false) }}>
    <div className="eyebrow">Revisa antes de continuar</div><h2 id="confirm-title">{request?.title}</h2><p id="confirm-message">{request?.message}</p>
    <div className="dialog-actions"><button ref={cancel} type="button" onClick={() => finish(false)}>Cancelar</button><Button intent={request?.danger ? 'danger' : 'primary'} onClick={() => finish(true)}>{request?.action}</Button></div>
  </dialog></Context.Provider>
}
