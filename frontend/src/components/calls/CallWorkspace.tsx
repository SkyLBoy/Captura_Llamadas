import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { CallAttempt, CallFormData, Channel, ContactDetail, PhoneNumber, SurveyData } from '../../pages/MakeCall'
import { validateSurvey, type SurveyAnswer } from '../../utils/callValidation'
import { Button } from '../ui/Button'
import { Feedback } from '../ui/Feedback'
import { useConfirm } from '../ui/ConfirmProvider'

type Setter<T> = Dispatch<SetStateAction<T>>
type Props = {
  attempt: CallAttempt | null; detail: ContactDetail | null; campaignName: string; campaignId?: number;
  state?: { campaignId: number; clientId: number; assignmentId: number };
  contactId: number | null; phone: PhoneNumber | null; selectContact: (id: number | null) => void; selectPhone: (phone: PhoneNumber) => void;
  start: (data: CallFormData) => Promise<void>; pendingStart: boolean; starting: boolean; startError: string | null;
  survey: SurveyData | null; completed: boolean; setCompleted: Setter<boolean>; declined: boolean; setDeclined: Setter<boolean>;
  answers: SurveyAnswer[]; setAnswers: Setter<SurveyAnswer[]>; errors: Record<number,string>; setErrors: Setter<Record<number,string>>;
  channels: Channel[]; dispositions: { disposition_id: number; code: string; description: string }[];
  channelCode: string | null; selectChannel: (code: string | null) => void;
  notes: string; setNotes: Setter<string>; newPhone: string | null; setNewPhone: Setter<string | null>; newEmail: string | null; setNewEmail: Setter<string | null>; newBusiness: string | null; setNewBusiness: Setter<string | null>;
  close: () => Promise<void>; closing: boolean; closeError: string | null; ready: boolean; detailsReady: boolean; elapsed: number; feedback: ReactNode; draftSaveError: string | null;
}
const phoneLabels: Record<string,string> = { main: 'Principal', reference1: 'Referencia 1', reference2: 'Referencia 2', mobile: 'Celular', other: 'Otro' }
const time = (s: number) => [Math.floor(s/3600), Math.floor(s/60)%60, s%60].map(n => String(n).padStart(2,'0')).join(':')

export default function CallWorkspace(p: Props) {
  const [view, setView] = useState<'survey' | 'channels' | 'review'>('survey')
  const [index, setIndex] = useState(0)
  const [localError, setLocalError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const confirm = useConfirm()
  const contactId = p.attempt ? p.attempt.contact_id : p.contactId
  const person = p.detail?.contacts.find(c => c.contact_id === contactId)
  const emails = p.detail?.emails.filter(c => c.contact_id === contactId) || []
  const number = p.attempt?.dialed_number ?? p.phone?.number
  const extension = p.attempt?.dialed_extension ?? (!p.attempt ? p.phone?.extension : null)
  const needsSurvey = Boolean(p.survey && !p.completed && !p.declined)
  const currentView = needsSurvey ? 'survey' : view === 'review' ? 'review' : 'channels'
  const step = !p.attempt ? 0 : currentView === 'survey' ? 1 : currentView === 'channels' ? 2 : 3
  const questions = p.survey?.questions || []
  const question = questions[Math.min(index, Math.max(questions.length - 1, 0))]
  const answer = question ? p.answers.find(a => a.questionId === question.question_id) : undefined
  const channel = p.channels.find(c => c.code === p.channelCode)
  const disposition = p.dispositions.find(d => d.disposition_id === channel?.disposition_id)
  const changedBusiness = Boolean(p.newBusiness?.trim() && p.newBusiness.trim() !== p.detail?.client.razon_social)
  const isBlacklist = changedBusiness || disposition?.code === 'BLACKLIST'
  useEffect(() => { setCopyStatus('') }, [number, extension])
  useEffect(() => { title.current?.focus() }, [step, index])
  useEffect(() => { if (localError || p.closeError) errorRef.current?.focus() }, [localError, p.closeError])
  const fail = (message: string) => { setLocalError(message); requestAnimationFrame(() => errorRef.current?.focus()) }
  const updateAnswer = (optionId: number | null, answerText: string | null) => {
    if (!question) return
    p.setAnswers(previous => [...previous.filter(a => a.questionId !== question.question_id), { questionId: question.question_id, optionId, answerText }])
    p.setErrors(previous => { const next = { ...previous }; delete next[question.question_id]; return next })
    setLocalError('')
  }
  const nextQuestion = () => {
    const errors = validateSurvey(question ? [question] : [], p.answers)
    p.setErrors(errors)
    if (Object.keys(errors).length) return fail('Revisa la respuesta antes de continuar.')
    if (index < questions.length - 1) { setIndex(index + 1); return }
    const all = validateSurvey(questions, p.answers)
    p.setErrors(all)
    if (Object.keys(all).length) { setIndex(questions.findIndex(q => all[q.question_id])); return fail('Hay respuestas pendientes de revisar.') }
    p.setCompleted(true); setView('channels'); setLocalError('')
  }
  const review = () => {
    if (!channel) return fail('Selecciona una canalización disponible para esta campaña.')
    if ((p.newPhone?.trim() || p.newEmail?.trim() || p.newBusiness?.trim()) && !changedBusiness && p.channelCode !== 'NUEVOS_DATOS') return fail('Selecciona NUEVOS_DATOS para actualizar teléfono o correo.')
    setLocalError(''); setView('review')
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(number || ''); setCopyStatus('Número copiado. Marca manualmente en MicroSIP.') }
    catch { setCopyStatus('No se pudo copiar. Selecciona el número y cópialo manualmente.') }
  }
  return <div className="call-workspace">
    <section className="call-ribbon" aria-label="Datos de la llamada">
      <div><div className="eyebrow">Razón social</div><h1>{p.detail?.client.razon_social || 'Sin razón social registrada'}</h1><small>Clave: {p.detail?.client.clave || '—'} · Sucursal: {p.detail?.client.sucursal || 'Sin sucursal'}</small><small>Campaña: {p.campaignName || (p.campaignId ? `ID ${p.campaignId}` : 'Cargando…')}</small></div>
      <div><div className="eyebrow">Persona de contacto</div><strong>{person?.nombre?.trim() || (contactId ? 'Contacto sin nombre registrado' : p.attempt ? 'Sin persona asociada' : 'Selecciona una persona')}</strong><small>Ejecutivo: {person?.ejecutivo || 'No registrado'}</small></div>
      <div><div className="eyebrow">{p.attempt ? 'Teléfono marcado' : 'Teléfono seleccionado'}</div><strong>{number || 'Selecciona un teléfono'}</strong><small>Extensión: {extension || 'Sin extensión'}</small></div>
      <div><div className="call-clock" aria-label="Duración de la llamada">{time(p.elapsed)}</div><small>{p.attempt ? '● Registro en curso' : '○ Por iniciar'}</small></div>
    </section>
    <nav className="call-progress" aria-label="Etapas de la llamada">{['Preparar','Conversar','Canalizar','Cerrar'].map((label,i) => <div key={label} aria-current={step === i ? 'step' : undefined}><b>0{i+1}</b>{label}</div>)}</nav>
    {p.feedback}
    <div className="call-desk"><section className="call-stage" aria-label="Captura de llamada">
    {!p.attempt ? <>
      <div className="eyebrow">Antes de llamar</div><h2 ref={title} tabIndex={-1}>Una persona. Una conversación.</h2><p className="small">Selecciona a quién marcar y el teléfono que utilizarás. La marcación se realiza manualmente en MicroSIP.</p>
      <fieldset disabled={p.starting || p.pendingStart || !p.detailsReady}><legend>Persona de contacto</legend><div className="call-options">{p.detail?.contacts.map(contact => <label key={contact.contact_id} className="call-choice"><input type="radio" name="contact-person" checked={p.contactId === contact.contact_id} onChange={() => p.selectContact(contact.contact_id)} /><div><strong>{contact.nombre?.trim() || 'Contacto sin nombre registrado'}</strong><small>Ejecutivo: {contact.ejecutivo || 'No registrado'}</small></div></label>)}</div>
      {p.detail?.contacts.length === 0 && <Feedback>No hay personas de contacto disponibles.</Feedback>}
      <h3>Teléfonos de la persona seleccionada</h3><div className="call-options">{p.detail?.phones.filter(phone => phone.contact_id === p.contactId).map(phone => <label key={phone.phone_id} className="call-choice"><input type="radio" name="contact-phone" checked={p.phone?.phone_id === phone.phone_id} onChange={() => p.selectPhone(phone)} /><div><strong>{phone.number}</strong><small>{phoneLabels[phone.type] || phone.type} · Extensión: {phone.extension || 'Sin extensión'}</small></div></label>)}</div>
      {!p.contactId && <p className="small">Selecciona una persona para consultar sus teléfonos.</p>}{p.contactId && !p.detail?.phones.some(phone => phone.contact_id === p.contactId) && <Feedback>Esta persona no tiene teléfonos registrados.</Feedback>}
      </fieldset>
      {p.pendingStart && <Feedback tone="warning">Al reintentar se enviarán los mismos datos del intento anterior.</Feedback>}{p.startError && <Feedback tone="error">{p.startError}</Feedback>}
      <div className="call-actions"><span className="small">El registro inicia el cronómetro.</span><Button intent="primary" busy={p.starting} disabled={!p.phone || !p.contactId || !p.detailsReady} onClick={() => { if (p.state && p.phone && p.contactId && p.phone.contact_id === p.contactId) void p.start({ ...p.state, contactId: p.contactId, dialedNumber: p.phone.number, dialedExtension: p.phone.extension }) }}>Iniciar registro</Button></div>
    </> : <fieldset disabled={p.closing || !p.ready}>
      {currentView === 'survey' && <><div className="eyebrow">Encuesta · {p.survey?.version.version_name}</div><h2 ref={title} tabIndex={-1}>Escucha. Registra lo importante.</h2><p className="question-progress">Pregunta {questions.length ? index+1 : 0} de {questions.length}</p>
        {question && <fieldset aria-describedby={p.errors[question.question_id] ? `error-${question.question_id}` : undefined}><legend>{question.question_text} {question.required && <span className="small">(obligatoria)</span>}</legend>
        {question.question_type === 'single_select' ? <div className="call-options">{question.options.map(option => <div key={option.option_id}><label className="call-choice"><input type="radio" name={`question-${question.question_id}`} checked={answer?.optionId === option.option_id} aria-invalid={Boolean(p.errors[question.question_id])} aria-describedby={p.errors[question.question_id] ? `error-${question.question_id}` : undefined} onChange={() => updateAnswer(option.option_id, null)} /><div>{option.option_text}</div></label>
          {option.requires_reason && answer?.optionId === option.option_id && <div className="question-reason"><label htmlFor={`reason-${option.option_id}`}>Especifica tu respuesta</label><textarea className="resize-none" style={{ resize: 'none' }} id={`reason-${option.option_id}`} value={answer.answerText || ''} onChange={e => updateAnswer(option.option_id,e.target.value || null)} aria-invalid={Boolean(p.errors[question.question_id])} aria-describedby={p.errors[question.question_id] ? `error-${question.question_id}` : undefined} /></div>}
        </div>)}</div> : <><label htmlFor={`answer-${question.question_id}`} className="small">Respuesta</label><textarea className="resize-none" style={{ resize: 'none', width: '100%' }} id={`answer-${question.question_id}`} value={answer?.answerText || ''} onChange={e => updateAnswer(null,e.target.value || null)} aria-invalid={Boolean(p.errors[question.question_id])} aria-describedby={p.errors[question.question_id] ? `error-${question.question_id}` : undefined} /></>}
        <p id={`error-${question.question_id}`} className="question-error">{p.errors[question.question_id]}</p></fieldset>}
        <label className="check-label"><input type="checkbox" checked={p.declined} onChange={e => { p.setDeclined(e.target.checked); setView('channels'); setLocalError('') }} />El cliente indicó que no desea responder la encuesta.</label>
        <div className="call-actions"><Button disabled={index === 0} onClick={() => { setIndex(index - 1); setLocalError('') }}>← Pregunta anterior</Button><Button intent="primary" onClick={nextQuestion}>{index < questions.length - 1 ? 'Siguiente pregunta →' : 'Completar encuesta →'}</Button></div>
      </>}
      {currentView === 'channels' && <><div className="eyebrow">Resultado de la conversación</div><h2 ref={title} tabIndex={-1}>Elige la canalización.</h2>
        {p.survey && <><Feedback>{p.declined ? 'El cliente no desea responder la encuesta.' : 'Encuesta completada. Las respuestas se guardarán al cerrar la llamada.'}</Feedback><Button onClick={() => { p.setCompleted(false); p.setDeclined(false); setView('survey'); setLocalError('') }}>Revisar encuesta</Button></>}
        {!p.survey && <p className="small">Esta campaña no requiere encuesta.</p>}
        <h3>Canalizaciones disponibles para esta campaña</h3><p className="small">Elige el resultado real de la llamada. La disposición la define administración.</p>
        <div className="call-options">{p.channels.map(item => <label className="call-choice" key={item.channel_id}><input type="radio" name="channel" checked={p.channelCode === item.code} onChange={() => { p.selectChannel(item.code); setLocalError('') }} /><div><strong>{item.description}</strong><small>{item.code}</small><small>Disposición: {p.dispositions.find(d => d.disposition_id === item.disposition_id)?.description || 'Asignada por administración'}</small></div></label>)}</div>
        {p.channels.length === 0 && <Feedback tone="warning">No hay canalizaciones disponibles. Solicita a administración revisar el catálogo de la campaña.</Feedback>}
        <details className="data-update" open={Boolean(p.newPhone || p.newEmail || p.newBusiness)}><summary>Actualizar datos del contacto</summary><p className="small">Para cambiar teléfono o correo selecciona NUEVOS_DATOS. Cambiar la razón social envía el contacto a Blacklist.</p>
          <label htmlFor="new-phone">Nuevo teléfono<input id="new-phone" type="tel" value={p.newPhone || ''} onChange={e => p.setNewPhone(e.target.value || null)} /></label>
          <label htmlFor="new-email">Nuevo correo electrónico<input id="new-email" type="email" value={p.newEmail || ''} onChange={e => p.setNewEmail(e.target.value || null)} /></label>
          <label htmlFor="new-business">Nueva razón social<input id="new-business" value={p.newBusiness || ''} onChange={e => p.setNewBusiness(e.target.value || null)} /></label>
        </details>
        {isBlacklist && <Feedback tone="warning">Este cierre enviará el contacto a Blacklist{changedBusiness ? ' por el cambio de razón social' : ''}.</Feedback>}
        <div className="call-actions"><span className="small">Revisa los datos antes de guardar.</span><Button intent="primary" disabled={!channel} onClick={review}>Revisar cierre →</Button></div>
      </>}
      {currentView === 'review' && <><div className="eyebrow">Última revisión</div><h2 ref={title} tabIndex={-1}>Así quedará esta conversación.</h2><dl className="review-grid">
        <div><dt>Razón social</dt><dd>{p.detail?.client.razon_social || 'Sin razón social'}</dd></div><div><dt>Persona de contacto</dt><dd>{person?.nombre || 'Sin nombre registrado'}</dd></div>
        <div><dt>Teléfono marcado</dt><dd>{number} {extension && `ext. ${extension}`}</dd></div><div><dt>Canalización</dt><dd>{channel?.description} ({p.channelCode})</dd></div>
        <div><dt>Disposición</dt><dd>{changedBusiness ? 'Blacklist por cambio de razón social' : disposition?.description || 'Asignada por administración'}</dd></div><div><dt>Encuesta</dt><dd>{!p.survey ? 'No aplica' : p.declined ? 'El cliente no desea responder' : 'Completada'}</dd></div>
        {p.survey && !p.declined && <div className="wide"><dt>Respuestas</dt><dd><ol>{questions.map(q => { const a = p.answers.find(a => a.questionId === q.question_id); return <li key={q.question_id}><span className="small">{q.question_text}</span><p>{q.options.find(o => o.option_id === a?.optionId)?.option_text || ''}{a?.answerText ? ` — ${a.answerText}` : ''}{!a ? 'Sin respuesta (opcional)' : ''}</p></li> })}</ol></dd></div>}
        {(p.newPhone || p.newEmail || p.newBusiness) && <div className="wide"><dt>Actualización de datos</dt><dd>{p.newPhone && <p>Teléfono: {p.newPhone}</p>}{p.newEmail && <p>Correo: {p.newEmail}</p>}{p.newBusiness && <p>Razón social: {p.newBusiness}</p>}</dd></div>}
        <div className="wide"><dt>Notas</dt><dd>{p.notes || 'Sin notas'}</dd></div>
      </dl>{isBlacklist && <Feedback tone="warning">El contacto pasará a Blacklist al confirmar este cierre.</Feedback>}
      <div className="call-actions"><Button onClick={() => { setView('channels'); setLocalError('') }}>← Volver a canalización</Button><Button intent="primary" busy={p.closing} onClick={async () => {
        if (closing.current) return
        closing.current = true
        try {
          if (isBlacklist && !await confirm({ title: 'Cerrar llamada y enviar a Blacklist', message: `El contacto ${p.detail?.client.razon_social || p.detail?.client.clave} quedará en Blacklist${changedBusiness ? ' por el cambio de razón social' : ` con la canalización ${channel?.description}`}.`, action: 'Confirmar cierre', danger: true })) return
          await p.close()
        } finally { closing.current = false }
      }}>Guardar y cerrar llamada</Button></div>
      </>}
    </fieldset>}
    {(localError || p.closeError) && <div ref={errorRef} tabIndex={-1}><Feedback tone="error">{localError || p.closeError}</Feedback></div>}
    </section><aside className="call-notebook"><div className="eyebrow">Tu libreta</div><h2><label htmlFor="call-notes">Notas de la conversación</label></h2><textarea className="resize-none" style={{ resize: 'none' }} id="call-notes" value={p.notes} onChange={e => p.setNotes(e.target.value)} disabled={!p.attempt || !p.ready || p.closing} placeholder={p.attempt ? 'Anota lo importante y el seguimiento acordado…' : 'Disponible al iniciar el registro.'} /><p className="small" role="status">{p.attempt && p.ready ? p.draftSaveError ? 'El borrador no se pudo guardar.' : 'Borrador conservado en esta pestaña.' : 'Las notas acompañan el registro de la llamada.'}</p>
      <dl><dt>Correo de la persona de contacto</dt><dd>{emails.length ? emails.map(e => <p key={e.email_id}><a href={`mailto:${e.email}`}>{e.email}</a></p>) : contactId ? 'Sin correo registrado' : 'Selecciona una persona'}</dd><dt>Teléfono y extensión</dt><dd>{number || 'Sin teléfono seleccionado'}{extension && ` ext. ${extension}`}</dd></dl>
      {number && <Button onClick={copy}>Copiar teléfono</Button>}<p className="small" role="status">{copyStatus}</p>
      {p.attempt && <dl><dt>Inicio del registro</dt><dd>{new Date(p.attempt.call_start).toLocaleString('es-MX', { timeZone: 'America/Hermosillo' })}</dd><dt>Referencia de llamada</dt><dd>#{p.attempt.attempt_id}</dd></dl>}
      <p className="small">Marcación manual en MicroSIP. El cronómetro mide el tiempo del registro.</p>
    </aside></div>
  </div>
}
