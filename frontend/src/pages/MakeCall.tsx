import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { createRequestKey, validateSurvey, type SurveyAnswer, type SurveyQuestion } from '../utils/callValidation'
import { api, ApiError } from '../services/api'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import CallWorkspace from '../components/calls/CallWorkspace'
import { Feedback } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { loadCallDraft, saveCallDraft, removeCallDraft} from '../utils/callDraft'

export type CallFormData = {
  campaignId: number
  assignmentId: number
  clientId: number
  contactId: number | null
  dialedNumber: string
  dialedExtension: string | null
}

type ContactPerson = {
  contact_id: number
  nombre: string | null
  ejecutivo: string | null
}

export type PhoneNumber = {
  phone_id: number
  contact_id: number
  type: 'main' | 'reference1' | 'reference2' | 'mobile' | 'other'
  number: string
  extension: string | null
}

type EmailAddress = {
  email_id: number
  contact_id: number
  email: string
}

export type ContactDetail = {
  client: {
    client_id: number
    clave: string
    razon_social: string | null
    sucursal: string | null
  }
  contacts: ContactPerson[]
  phones: PhoneNumber[]
  emails: EmailAddress[]
}

type SurveyVersion = {
  version_id: number
  version_name: string
}

export type SurveyData = {
  version: SurveyVersion
  questions: SurveyQuestion[]
}

export type Channel = {
  channel_id: number
  campaign_id: number
  code: string
  description: string
  disposition_id: number | null
  is_active: boolean
}

export type CallAttempt = {
  attempt_id: number
  campaign_id: number
  client_id: number
  contact_id: number | null
  assignment_id: number
  call_start: string
  dialed_number: string
  dialed_extension: string | null
  state: string
}

const MakeCall: React.FC = () => {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [detailsStatus, setDetailsStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsRetry, setDetailsRetry] = useState(0)
  const startInFlight = useRef(false)
  const closeInFlight = useRef(false)
  const pendingStart = useRef<Parameters<typeof api.calls.create>[0] | null>(null)
  const [draftStatus, setDraftStatus] =
  useState<'loading' | 'ready' | 'error'>('loading')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftRetry, setDraftRetry] = useState(0)
  const restoredDraftKey = useRef<string | null>(null)
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null)
  const [draftSaveRetry, setDraftSaveRetry] = useState(0)
  // State for the call flow
  const [attempt, setAttempt] = useState<CallAttempt | null>(null)
  const [openAttemptStatus, setOpenAttemptStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [openAttemptRetry, setOpenAttemptRetry] = useState(0) // to trigger re-fetch of open attempt if needed
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null)
  const [surveyStatus, setSurveyStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [surveyRetry, setSurveyRetry] = useState(0) // to trigger re-fetch of survey if needed
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [dispositions, setDispositions] = useState<{ disposition_id: number; code: string; description: string }[]>([])
  const [campaignName, setCampaignName] = useState('')

  // Form state for starting a call
  const [selectedContactPersonId, setSelectedContactPersonId] = useState<number | null>(null)
  const [selectedPhone, setSelectedPhone] = useState<PhoneNumber | null>(null)
  const [isCalling, setIsCalling] = useState(false)
  const [callError, setCallError] = useState<string | null>(null)

  // Form state for ongoing call
  const [notes, setNotes] = useState('')
  const [selectedChannelCode, setSelectedChannelCode] = useState<string | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [surveyCompleted, setSurveyCompleted] = useState(false)
  const [surveyDeclined, setSurveyDeclined] = useState(false)
  const [surveyAnswers, setSurveyAnswers] = useState<SurveyAnswer[]>([])
  const [surveyErrors, setSurveyErrors] = useState<Record<number, string>>({})
  // New data fields for call close
  const [newDataPhone, setNewDataPhone] = useState<string | null>(null)
  const [newDataEmail, setNewDataEmail] = useState<string | null>(null)
  const [newDataBusinessName, setNewDataBusinessName] = useState<string | null>(null)

  // Timer for the call
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Get state from location (passed from ContactList)
  const state = location.state as {
    campaignId: number
    clientId: number
    assignmentId: number
  } | undefined

  // Load open attempt on mount and when user changes
useEffect(() => {
  if (!user) return

  let cancelled = false
  setOpenAttemptStatus('loading')

  const recoverAttempt = async () => {
    try {
      const result = await api.calls.getOpen()

      if (!cancelled) {
        setAttempt(result.attempt ?? null)
        setOpenAttemptStatus('ready')
      }
    } catch {
      if (!cancelled) {
        setOpenAttemptStatus('error')
      }
    }
  }

  recoverAttempt()

  return () => {
    cancelled = true
  }
}, [user, openAttemptRetry])

  // Load survey for the campaign when we have an attempt
useEffect(() => {
  let cancelled = false

  setSurveyData(null)
  setSurveyStatus('loading')

  if (!attempt?.campaign_id) return

  const campaignId = attempt.campaign_id

  const fetchSurvey = async () => {
    try {
      const response = await api.campaigns.getAll()

      const campaigns: Array<{
        campaign_id: number
        name: string
      }> = response.campaigns

      const campaign = campaigns.find(
        item => item.campaign_id === campaignId
      )

      if (!campaign) {
        throw new Error('No se encontró la campaña.')
      }

      const result =
        campaign.name === 'SILIMEX'
          ? await api.surveys.getActiveVersion(campaignId)
          : null

      if (!cancelled) {
        setCampaignName(campaign.name)
        setSurveyData(result)
        setSurveyStatus('ready')
      }
    } catch {
      if (!cancelled) {
        setSurveyStatus('error')
      }
    }
  }

  fetchSurvey()

  return () => {
    cancelled = true
  }
}, [attempt?.attempt_id, attempt?.campaign_id, surveyRetry])

  // Ignore late responses from a previously selected client or campaign.
  useEffect(() => {
    if (openAttemptStatus !== 'ready') return
    const clientId = attempt?.client_id ?? state?.clientId
    const campaignId = attempt?.campaign_id ?? state?.campaignId
    if (!clientId || !campaignId) return
    let cancelled = false
    setDetailsStatus('loading')
    setDetailsError(null)
    setContactDetail(null)
    setChannels([])
    setSelectedContactPersonId(null)
    setSelectedPhone(null)
    setSelectedChannelCode(null)
    const loadDetails = async () => {
      try {
        const [detail, catalog, campaigns] = await Promise.all([
          api.contacts.getByClient(clientId, campaignId),
          api.catalogs.getByCampaign(campaignId),
          api.campaigns.getAll().catch(() => null),
        ])
        if (!cancelled) {
          setContactDetail(detail)
          setChannels((catalog.channels ?? []).filter((channel: Channel) => channel.is_active && channel.disposition_id !== null))
          setDispositions(catalog.dispositions ?? [])
          setCampaignName(campaigns?.campaigns?.find((item: { campaign_id: number }) => item.campaign_id === campaignId)?.name || '')
          setDetailsStatus('ready')
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setDetailsError(error instanceof Error ? error.message : 'No se pudieron cargar los datos.')
          setDetailsStatus('error')
        }
      }
    }
    loadDetails()
    return () => { cancelled = true }
  }, [openAttemptStatus, attempt?.client_id, attempt?.campaign_id, state?.clientId, state?.campaignId, detailsRetry])

  useEffect(() => {
  if (!attempt?.call_start) {
    setElapsedSeconds(0)
    return
  }

  const startTime = new Date(attempt.call_start).getTime()

  if (!Number.isFinite(startTime)) {
    setElapsedSeconds(0)
    return
  }

  const updateTimer = () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    setElapsedSeconds(Math.max(0, elapsed))
  }

  updateTimer()

  const interval = window.setInterval(updateTimer, 1000)

  return () => window.clearInterval(interval)
}, [attempt?.attempt_id, attempt?.call_start])


useEffect(() => {
  if (!user || !attempt) {
    restoredDraftKey.current = null
    setDraftStatus('loading')
    setDraftError(null)
    return
  }

  if (detailsStatus !== 'ready' || surveyStatus !== 'ready') return

  const key = `${user.id}:${attempt.attempt_id}`

  if (restoredDraftKey.current === key) return

  setDraftStatus('loading')
  setDraftError(null)

  try {
    const draft = loadCallDraft(user.id, attempt.attempt_id)

    if (draft) {
      const currentVersionId = surveyData?.version.version_id ?? null

      if (draft.surveyVersionId !== currentVersionId) {
        throw new Error(
          'La versión de la encuesta cambió. El borrador se conserva, ' +
          'pero no se recuperará automáticamente sobre otra versión.'
        )
      }

      setNotes(draft.notes)
      setNewDataPhone(draft.newDataPhone)
      setNewDataEmail(draft.newDataEmail)
      setNewDataBusinessName(draft.newDataBusinessName)

      const validChannel = channels.some(
        channel => channel.code === draft.channelCode
      )

      setSelectedChannelCode(validChannel ? draft.channelCode : null)

      const surveyErrors = surveyData
        ? validateSurvey(surveyData.questions, draft.surveyAnswers)
        : {}

      setSurveyAnswers(draft.surveyAnswers)
      setSurveyDeclined(draft.surveyDeclined)
      setSurveyErrors(surveyErrors)
      setSurveyCompleted(
        !draft.surveyDeclined &&
        draft.surveyCompleted &&
        Object.keys(surveyErrors).length === 0
      )
    }

    restoredDraftKey.current = key
    setDraftStatus('ready')
  } catch (cause: unknown) {
    setDraftError(
      cause instanceof Error
        ? cause.message
        : 'No se pudo recuperar el borrador.'
    )
    setDraftStatus('error')
  }
}, [
  user?.id,
  attempt?.attempt_id,
  detailsStatus,
  surveyStatus,
  surveyData,
  channels,
  draftRetry,
])

useEffect(() => {
  if (
    !user ||
    !attempt ||
    draftStatus !== 'ready' ||
    detailsStatus !== 'ready' ||
    surveyStatus !== 'ready' ||
    isClosing
  ) return

  const key = `${user.id}:${attempt.attempt_id}`

  if (restoredDraftKey.current !== key) return

  try {
    saveCallDraft(user.id, attempt.attempt_id, {
      version: 1,
      notes,
      channelCode: selectedChannelCode,
      newDataPhone,
      newDataEmail,
      newDataBusinessName,
      surveyVersionId: surveyData?.version.version_id ?? null,
      surveyCompleted,
      surveyDeclined,
      surveyAnswers,
    })

    setDraftSaveError(null)
  } catch {
    setDraftSaveError(
      'No se pudo guardar el borrador en esta pestaña. ' +
      'No recargues ni salgas de la captura hasta guardar la llamada.'
    )
  }
}, [
  user?.id,
  attempt?.attempt_id,
  draftStatus,
  detailsStatus,
  surveyStatus,
  isClosing,
  notes,
  selectedChannelCode,
  newDataPhone,
  newDataEmail,
  newDataBusinessName,
  surveyData,
  surveyCompleted,
  surveyDeclined,
  surveyAnswers,
  draftSaveRetry,
])

  // Freeze the request for retries and block double clicks synchronously.
  const handleStartCall = useCallback(async (formData: CallFormData) => {
    if (!user || attempt || startInFlight.current || detailsStatus !== 'ready') return
    startInFlight.current = true
    setIsCalling(true)
    setCallError(null)
    try {
      if (!pendingStart.current) {
        pendingStart.current = {
          ...formData,
          dialedExtension: formData.dialedExtension?.trim() || undefined,
          idempotencyKey: createRequestKey(),
        }
      }
      const request = pendingStart.current
      const result = await api.calls.create(request)
      if (result.state === 'closed') {
        // A delayed retry may arrive after another tab has closed this call.
        pendingStart.current = null
        navigate('/contactos', { replace: true, state: null })
        return
      }
      setAttempt({
        ...result,
        campaign_id: request.campaignId,
        client_id: request.clientId,
        contact_id: request.contactId,
        assignment_id: request.assignmentId,
        dialed_number: request.dialedNumber,
        dialed_extension: request.dialedExtension ?? null,
        state: result.state,
      })
      pendingStart.current = null
      setSelectedContactPersonId(null)
      setSelectedPhone(null)
    } catch (error: unknown) {
      // A validation rejection did not create a call, so allow correcting its data.
      if (error instanceof ApiError && (error.status === 400 || error.status === 422)) {
        pendingStart.current = null
      }
      setCallError(error instanceof Error ? error.message : 'Error al iniciar la llamada')
    } finally {
      startInFlight.current = false
      setIsCalling(false)
    }
  }, [user, 
      attempt, 
      detailsStatus,
      draftStatus,
      surveyStatus,
      navigate
    ])

  // Handle closing a call
  const handleCloseCall = useCallback(async () => {
    if (!attempt || !user || closeInFlight.current) return
    if (draftStatus !== 'ready') {
      setCloseError('Espera a que se compruebe el borrador de la llamada.')
      return
    }
    if (detailsStatus !== 'ready') {
      setCloseError('Espera a que se carguen los datos y las canalizaciones.')
      return
    }

    if (surveyStatus !== 'ready') {
      setCloseError(
        surveyStatus === 'loading'
          ? 'Espera a que termine la consulta de la encuesta.'
          : 'No se pudo consultar la encuesta. El cierre no se ha enviado.'
      )
      return
    }

    setCloseError(null)

    if (!selectedChannelCode) {
      setCloseError('Selecciona una canalización.')
      return
    }

    if (surveyData && !surveyDeclined) {
      const errors = validateSurvey(surveyData.questions, surveyAnswers)
      if (!surveyCompleted || Object.keys(errors).length > 0) {
        setSurveyErrors(errors)
        setSurveyCompleted(false)
        setCloseError('Completa la encuesta antes de cerrar la llamada.')
        return
      }
    }
    const includeSurvey = surveyCompleted || surveyDeclined

    if (includeSurvey && !surveyData) {
      setCloseError('No se ha cargado la versión de la encuesta.')
      return
    }

    const phone = newDataPhone?.trim() || undefined
    const email = newDataEmail?.trim() || undefined
    const businessName = newDataBusinessName?.trim() || undefined

    const changedBusinessName = businessName !== undefined && businessName !== contactDetail?.client.razon_social
    if ((phone || email || businessName) && !changedBusinessName && selectedChannelCode !== 'NUEVOS_DATOS') {
      setCloseError('Selecciona NUEVOS_DATOS para actualizar teléfono o correo.')
      return
    }

    const closeData: Parameters<typeof api.calls.close>[1] = {
      channelCode: selectedChannelCode,
      notes: notes.trim() || undefined,
    }

    if (phone || email || businessName) {
      closeData.newData = {
        phone,
        email,
        businessName,
      }
    }

    if (includeSurvey && surveyData) {
      closeData.survey = {
        versionId: surveyData.version.version_id,
        declined: surveyDeclined,
        answers: surveyDeclined
          ? []
          : surveyAnswers.filter(answer => answer.optionId !== null || answer.answerText?.trim()).map(answer => ({
              questionId: answer.questionId,
              optionId: answer.optionId ?? undefined,
              answerText: answer.answerText?.trim() || undefined,
            })),
      }
    }

    closeInFlight.current = true
    setIsClosing(true)

    try {
      const result = await api.calls.close(attempt.attempt_id, closeData)

      if (result) {
        restoredDraftKey.current = null

        try{
          removeCallDraft(user.id, attempt.attempt_id)
        } catch {
          console.warn('La llamada se cerró, pero no se pudo elimnar el borrador local.')
        }
        setAttempt(null)
        setSurveyData(null)
        setSelectedChannelCode(null)
        setNotes('')
        setSurveyCompleted(false)
        setSurveyDeclined(false)
        setSurveyAnswers([])
        setSurveyErrors({})
        setNewDataPhone(null)
        setNewDataEmail(null)
        setNewDataBusinessName(null)
        pendingStart.current = null
        navigate('/contactos', { replace: true, state: null })
      }
    } catch (e: unknown) {
      setCloseError(
        e instanceof Error ? e.message : 'Error al cerrar la llamada'
      )
    } finally {
      closeInFlight.current = false
      setIsClosing(false)
    }
  }, [
    attempt,
    user,
    draftStatus,
    surveyStatus,
    selectedChannelCode,
    notes,
    surveyData,
    surveyCompleted,
    surveyDeclined,
    surveyAnswers,
    newDataPhone,
    newDataEmail,
    newDataBusinessName,
    detailsStatus,
    contactDetail,
    navigate,
  ])
  // Handle selecting a contact person
  const handleSelectContactPerson = useCallback((contactId: number | null) => {
    setSelectedContactPersonId(contactId)
    // Reset phone selection when contact person changes
    setSelectedPhone(null)
  }, [])

  // Handle selecting a phone
  const handleSelectPhone = useCallback((phone: PhoneNumber | null) => {
    setSelectedPhone(phone)
  }, [])

  // Handle selecting a channel
  const handleSelectChannel = useCallback((code: string | null) => {
    setSelectedChannelCode(code)
  }, [])
  if (!user) return <Navigate to="/login" replace />
  if (openAttemptStatus === 'loading') return <Feedback>Comprobando si tienes una llamada abierta…</Feedback>
  if (openAttemptStatus === 'error') return <Feedback tone="error">No se pudo comprobar si tienes una llamada abierta. <Button onClick={() => setOpenAttemptRetry(value => value + 1)}>Reintentar</Button></Feedback>
  if (!state && !attempt) return <Feedback>Selecciona un contacto desde la lista para preparar una llamada. <Button onClick={() => navigate('/contactos')}>Ir a contactos</Button></Feedback>
  const ready = draftStatus === 'ready' && detailsStatus === 'ready' && surveyStatus === 'ready'
  const feedback = <>
    {detailsStatus === 'loading' && <Feedback>Cargando los datos y las canalizaciones…</Feedback>}
    {detailsStatus === 'error' && <Feedback tone="error">{detailsError} <Button onClick={() => setDetailsRetry(v => v + 1)}>Reintentar carga de datos</Button></Feedback>}
    {attempt && surveyStatus === 'loading' && <Feedback>Consultando la encuesta de la campaña…</Feedback>}
    {attempt && surveyStatus === 'error' && <Feedback tone="error">No se pudo consultar la encuesta. La llamada sigue abierta. <Button onClick={() => { setCloseError(null); setSurveyRetry(v => v + 1) }}>Reintentar consulta</Button></Feedback>}
    {attempt && draftStatus === 'loading' && <Feedback>Preparando la captura y comprobando el borrador…</Feedback>}
    {attempt && draftStatus === 'error' && <Feedback tone="error">{draftError} <Button onClick={() => setDraftRetry(v => v + 1)}>Reintentar recuperación</Button></Feedback>}
    {draftSaveError && <Feedback tone="warning">{draftSaveError} <Button disabled={isClosing} onClick={() => setDraftSaveRetry(v => v + 1)}>Reintentar guardado del borrador</Button></Feedback>}
  </>
  return <CallWorkspace
    attempt={attempt} detail={contactDetail} campaignName={campaignName} campaignId={attempt?.campaign_id ?? state?.campaignId} state={state}
    contactId={selectedContactPersonId} phone={selectedPhone} selectContact={handleSelectContactPerson} selectPhone={handleSelectPhone}
    start={handleStartCall} pendingStart={pendingStart.current !== null} starting={isCalling} startError={callError}
    survey={surveyData} completed={surveyCompleted} setCompleted={setSurveyCompleted} declined={surveyDeclined} setDeclined={setSurveyDeclined}
    answers={surveyAnswers} setAnswers={setSurveyAnswers} errors={surveyErrors} setErrors={setSurveyErrors}
    channels={channels} dispositions={dispositions} channelCode={selectedChannelCode} selectChannel={handleSelectChannel}
    notes={notes} setNotes={setNotes} newPhone={newDataPhone} setNewPhone={setNewDataPhone} newEmail={newDataEmail} setNewEmail={setNewDataEmail} newBusiness={newDataBusinessName} setNewBusiness={setNewDataBusinessName}
    close={handleCloseCall} closing={isClosing} closeError={closeError} ready={ready} detailsReady={detailsStatus === 'ready'} elapsed={elapsedSeconds} feedback={feedback} draftSaveError={draftSaveError}
  />
}
export default MakeCall
