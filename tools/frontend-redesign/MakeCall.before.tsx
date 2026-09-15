import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { createRequestKey, validateSurvey, type SurveyAnswer, type SurveyQuestion } from '../utils/callValidation'
import { api, ApiError } from '../services/api'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { loadCallDraft, saveCallDraft, removeCallDraft} from '../utils/callDraft'

type CallFormData = {
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

type PhoneNumber = {
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

type ContactDetail = {
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

type SurveyData = {
  version: SurveyVersion
  questions: SurveyQuestion[]
}

type Channel = {
  channel_id: number
  campaign_id: number
  code: string
  description: string
  disposition_id: number | null
  is_active: boolean
}

type CallAttempt = {
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
        const [detail, catalog] = await Promise.all([
          api.contacts.getByClient(clientId, campaignId),
          api.catalogs.getByCampaign(campaignId),
        ])
        if (!cancelled) {
          setContactDetail(detail)
          setChannels(catalog.channels ?? [])
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
  if (user && openAttemptStatus === 'loading') {
  return (
    <div className="text-center py-8">
      Comprobando si tienes una llamada abierta...
    </div>
  )
}

  if (user && openAttemptStatus === 'error') {
    return (
      <div className="space-y-4 p-6">
        <p role="alert">
          No se pudo comprobar si tienes una llamada abierta.
          Reintenta antes de iniciar otro registro.
        </p>

        <button
          type="button"
          onClick={() => {
            setOpenAttemptStatus('loading')
            setOpenAttemptRetry(value => value + 1)
          }}
          className="rounded bg-indigo-600 px-4 py-2 text-white"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const availablePhones = (contactDetail?.phones ?? []).filter(phone => phone.contact_id === selectedContactPersonId)

  const currentContactId =
  attempt?.contact_id ?? selectedContactPersonId

  const contactEmails = (contactDetail?.emails ?? []).filter(
    email => email.contact_id === currentContactId
  )

  const contactInformation = (
    <div className="my-4 space-y-2 rounded-md bg-gray-50 p-4">
      <p>
        <span className="font-medium">Sucursal: </span>
        {contactDetail?.client.sucursal || 'Sin sucursal registrada'}
      </p>

      <div>
        <span className="font-medium">Correo del contacto: </span>

        {contactEmails.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {contactEmails.map(email => (
              <li key={email.email_id} className="break-words">
                <a
                  href={`mailto:${email.email}`}
                  className="text-indigo-700 underline"
                >
                  {email.email}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <span>
            {currentContactId == null
              ? 'Selecciona una persona de contacto'
              : 'Sin correo registrado'}
          </span>
        )}
      </div>
    </div>
  )

  // Render loading state
  if (detailsStatus === 'loading' && !attempt && state) {
    return <div className="text-center py-8">Cargando...</div>
  }

  // Redirect if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // If we don't have the necessary state from ContactList, redirect
  if (!state && !attempt) {
    return <div className="text-center py-8">Por favor, seleccione un contacto para llamar desde la lista de contactos.</div>
  }

  const detailsFeedback = detailsStatus === 'error' ? (
    <div role="alert" className="rounded bg-red-50 p-4 text-red-700">
      <p>{detailsError}</p>
      <button type="button" onClick={() => setDetailsRetry(value => value + 1)} className="mt-2 underline">
        Reintentar carga de datos
      </button>
    </div>
  ) : detailsStatus === 'loading' ? <p role="status">Cargando datos y canalizaciones...</p> : null

  // If we have an open attempt, show the ongoing call UI
  if (attempt) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">
            Llamada en curso{(attempt.state === 'open' ? '' : ' (cerrada)')}
          </h2>
          <div className="mb-4">
            <p className="text-gray-600">
              Iniciada: <span className="font-medium">{new Date(attempt.call_start).toLocaleString()}</span>
            </p>
            <p className="text-gray-600">
              Duración: <span className="font-medium">{formatTime(elapsedSeconds)}</span>
              <span className="text-sm text-gray-500">(informativo)</span>
            </p>
          </div>

        {surveyStatus === 'loading' && (
          <p role="status" className="mb-4 text-sm text-gray-600">
            Consultando la encuesta de la campaña…
          </p>
        )}

        {surveyStatus === 'error' && (
          <div
            role="alert"
            className="mb-4 rounded-md bg-red-50 p-4 text-red-700"
          >
            <p>
              No se pudo consultar la encuesta. La llamada sigue abierta.
            </p>

            <button
              type="button"
              onClick={() => {
                setCloseError(null)
                setSurveyStatus('loading')
                setSurveyRetry(previous => previous + 1)
              }}
              className="mt-3 rounded-md border border-red-700 px-3 py-2"
            >
              Reintentar consulta
            </button>
          </div>
        )}

        {draftStatus === 'loading' && (
          <p role="status">Preparando la captura y comprobando el borrador...</p>
        )}

        {draftStatus === 'error' && (
          <div role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-700">
            <p>{draftError}</p>
            <button
              type="button"
              onClick={() => setDraftRetry(value => value + 1)}
              className="mt-2 underline"
            >
              Reintentar recuperación
            </button>
          </div>
        )}

          {detailsFeedback}
          {draftSaveError && (
            <div role="alert" className="mb-4 rounded bg-amber-50 p-4 text-amber-900">
              <p>{draftSaveError}</p>

              <button
                type="button"
                disabled={isClosing}
                onClick={() => setDraftSaveRetry(value => value + 1)}
                className="mt-2 underline"
              >
                Reintentar guardado del borrador
              </button>
            </div>
          )}

          <fieldset disabled={isClosing || draftStatus !== 'ready'}
          className="min-w-0"
          >
          {contactDetail && contactInformation}
          {/* Survey section if exists and not completed */}
          {surveyData && !surveyCompleted && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Encuesta de satisfacción</h3>
              <div className="bg-gray-50 p-4 rounded">
                <div className="flex justify-between items-start mb-3">
                  <span>Cliente respondió la encuesta</span>
                  <div className="flex space-x-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={surveyDeclined}
                        onChange={(e) => setSurveyDeclined(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                      />
                      <span className="ml-2 text-sm font-medium">Cliente no respondió</span>
                    </label>
                  </div>
                </div>

                {!surveyDeclined && (
                  <>
                    {surveyData.questions.map((question) => (
                      <div key={question.question_id} className="mb-4">
                        <div className="font-medium text-gray-700">
                          {question.question_text}
                          {question.required && <span className="ml-1 text-red-500">*</span>}
                        </div>
                        {question.question_type === 'single_select' && (
                          <div className="mt-2 space-y-2">
                            {question.options.map((option) => (
                              <div key={option.option_id} className="flex items-start">
                                <input
                                  type="radio"
                                  checked={surveyAnswers.find(a => a.questionId === question.question_id)?.optionId === option.option_id}
                                  onChange={(e) => {
                                    const answerValue = e.target.checked ? Number(e.target.value) : null;
                                    setSurveyAnswers(prev => {
                                      const updatedAnswers = prev.filter(a => a.questionId !== question.question_id);
                                      if (answerValue !== null) {
                                        return [...updatedAnswers, { questionId: question.question_id, optionId: answerValue, answerText: null }];
                                      }
                                      return updatedAnswers;
                                    });

                                    // Limpiar errores cuando se selecciona una opción
                                    setSurveyErrors(prev => {
                                      const newErrors = {...prev};
                                      delete newErrors[question.question_id];
                                      return newErrors;
                                    });
                                  }}
                                  value={option.option_id}
                                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <div className="ml-3">
                                  <div className="font-medium text-gray-700">{option.option_text}</div>
                                  {option.requires_reason && surveyAnswers.find(a => a.questionId === question.question_id)?.optionId === option.option_id && (
                                    <div className="mt-2">
                                      <textarea
                                        value={surveyAnswers.find(a => a.questionId === question.question_id)?.answerText || ''}
                                        onChange={(e) => {
                                          setSurveyAnswers(prev => {
                                            const updatedAnswers = prev.filter(a => a.questionId !== question.question_id);
                                            const currentOptionId =
                                              prev.find(a => a.questionId === question.question_id)?.optionId ?? null;
                                            return [...updatedAnswers, {
                                              questionId: question.question_id,
                                              optionId: currentOptionId,
                                              answerText: e.target.value || null
                                            }];
                                          });
                                        }}
                                        placeholder="Especifique su respuesta..."
                                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        rows={2}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                            {/* Mostrar error si existe */}
                            {surveyErrors[question.question_id] && (
                              <p className="text-red-500 text-sm mt-1">{surveyErrors[question.question_id]}</p>
                            )}
                          </div>
                        )}
                        {question.question_type === 'text' && (
                          <div className="mt-2">
                            <textarea
                              value={surveyAnswers.find(a => a.questionId === question.question_id)?.answerText || ''}
                              onChange={(e) => {
                                setSurveyAnswers(prev => {
                                  const updatedAnswers = prev.filter(a => a.questionId !== question.question_id);
                                  return [...updatedAnswers, {
                                    questionId: question.question_id,
                                    optionId: null,
                                    answerText: e.target.value || null
                                  }];
                                });
                              }}
                              placeholder="Escriba su respuesta..."
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                              rows={3}
                            />
                            {/* Mostrar error si existe */}
                            {surveyErrors[question.question_id] && (
                              <p className="text-red-500 text-sm mt-1">{surveyErrors[question.question_id]}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="mt-4">
                      <button
                        onClick={async () => {
                          const newErrors = validateSurvey(surveyData.questions, surveyAnswers)
                          setSurveyErrors(newErrors)
                          if (Object.keys(newErrors).length > 0) return
                          setSurveyCompleted(true);
                        }}
                        disabled={isClosing}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        {isClosing ? 'Guardando encuesta...' : 'Completar encuesta'}
                      </button>
                    </div>
                  </>
                )}

                {surveyDeclined && (
                  <div className="mt-4">
                    <p className="text-gray-600">
                      El cliente ha indicado que no desea responder la encuesta.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {surveyCompleted && (
            <button type="button" onClick={() => setSurveyCompleted(false)} className="mb-4 text-indigo-700 underline">
              Revisar respuestas de la encuesta
            </button>
          )}

          {/* Notes and channel selection */}
          {!surveyData || surveyCompleted || surveyDeclined ? (
            <>
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Notas de la llamada</h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tomar notas sobre la llamada..."
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  rows={4}
                />
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Actualización de datos</h3>
                <p className="mb-3 text-sm text-gray-600">
                  Para cambiar teléfono o correo selecciona NUEVOS_DATOS. Cambiar la razón social envía el contacto a Blacklist.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Teléfono
                    </label>
                    <input
                      value={newDataPhone || ''}
                      onChange={(e) => setNewDataPhone(e.target.value || null)}
                      placeholder="Nuevo número de teléfono"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Correo electrónico
                    </label>
                    <input
                      value={newDataEmail || ''}
                      onChange={(e) => setNewDataEmail(e.target.value || null)}
                      placeholder="Nuevo correo electrónico"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Razón social
                    </label>
                    <input
                      value={newDataBusinessName || ''}
                      onChange={(e) => setNewDataBusinessName(e.target.value || null)}
                      placeholder="Nueva razón social"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Canalización</h3>
                {channels.length > 0 ? (
                  <div className="space-y-3">
                    {channels.map((channel) => (
                      <div key={channel.channel_id} className="flex items-center">
                        <input
                          type="radio"
                          value={channel.code}
                          checked={selectedChannelCode === channel.code}
                          onChange={(e) => handleSelectChannel(e.target.value)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <div className="ml-3">
                          <div className="font-medium text-gray-700">{channel.code}</div>
                          <div className="text-sm text-gray-500">{channel.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No hay canalizaciones disponibles para esta campaña</p>
                )}
              </div>
            </>
          ) : null}

          {closeError && (
            <div
              role="alert"
              className="bg-red-50 text-red-700 p-3 rounded"
            >
              {closeError}
            </div>
          )}

          {/* Call actions */}
          <div className="flex justify-end space-x-3">
            {!surveyData || surveyCompleted || surveyDeclined ? (
              <button
                onClick={handleCloseCall}
                disabled={
                  isClosing ||
                  !selectedChannelCode ||
                  surveyStatus !== 'ready' || detailsStatus !== 'ready'
                }
                className="w-auto flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {isClosing ? 'Cerrando llamada...' : 'Cerrar llamada'}
              </button>
            ) : null}
          </div>
          </fieldset>
        </div>
      </div>
    )
  }

  // If we don't have an attempt, show the form to start a call
  return (
    <div className="space-y-6">
      {/* Contact details header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Iniciar nueva llamada</h2>
        <div className="mb-4">
          <p className="text-gray-600">
            Campaña: <span className="font-medium">{state?.campaignId}</span>
          </p>
          <p className="text-gray-600">
            Cliente: <span className="font-medium">{contactDetail?.client.clave} - {contactDetail?.client.razon_social}</span>
          </p>
        </div>
      </div>

      {detailsFeedback}
      {contactDetail && contactInformation}
      {/* Form to start call */}
      {contactDetail && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Seleccione persona de contacto y teléfono</h3>

            <fieldset disabled={isCalling || pendingStart.current !== null}>
            {/* Contact person selection */}
            {contactDetail.contacts.length > 0 ? (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Persona de contacto
                </label>
                <div className="space-y-2">
                  {contactDetail.contacts.map((person) => (
                    <div key={person.contact_id} className="flex items-center">
                      <input
                        type="radio"
                        value={person.contact_id}
                        checked={selectedContactPersonId === person.contact_id}
                        onChange={(e) => handleSelectContactPerson(Number(e.target.value))}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <div className="ml-3">
                        <div className="font-medium text-gray-700">{person.nombre?.trim() || 'Contacto sin nombre registrado'}</div>
                        {person.ejecutivo && (
                          <div className="text-sm text-gray-500">Ejecutivo: {person.ejecutivo}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No hay personas de contacto disponibles</p>
            )}

            {/* Phone selection */}
            {selectedContactPersonId !== null ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono
                  </label>
                  {/* Filter phones for the selected contact person */}
                  {availablePhones.length > 0 ? (
                    <div className="space-y-2">
                      {availablePhones.map((phone) => (
                        <div key={phone.phone_id} className="flex items-center">
                          <input
                            type="radio"
                            value={phone.phone_id}
                            checked={selectedPhone?.phone_id === phone.phone_id}
                            onChange={() => handleSelectPhone(phone)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <div className="ml-3">
                            <div className="font-medium text-gray-700">{phone.type}</div>
                            <div className="text-sm text-gray-500">{phone.number}{phone.extension ? ` ext. ${phone.extension}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">No hay teléfonos disponibles para esta persona de contacto</p>
                  )}
                </div>
              </>
            ) : (
              <div className="mb-4">
                <p className="text-gray-500">Seleccione una persona de contacto primero</p>
              </div>
            )}

            </fieldset>
            {pendingStart.current && !isCalling && (
              <p className="mt-3 text-sm text-gray-600">Al reintentar se enviarán los mismos datos del intento anterior.</p>
            )}
            {/* Start call button */}
            <div className="mt-6">
              <button
                onClick={async () => {
                  if (!state || !selectedContactPersonId || !selectedPhone || selectedPhone.contact_id !== selectedContactPersonId) {
                    alert('Por favor, seleccione una persona de contacto y un teléfono')
                    return
                  }

                  const formData: CallFormData = {
                    campaignId: state!.campaignId,
                    assignmentId: state!.assignmentId,
                    clientId: state!.clientId,
                    contactId: selectedContactPersonId,
                    dialedNumber: selectedPhone.number,
                    dialedExtension: selectedPhone.extension
                  }

                  await handleStartCall(formData)
                }}
                disabled={isCalling || !selectedContactPersonId || !selectedPhone}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {isCalling ? 'Iniciando llamada...' : 'Iniciar registro'}
              </button>
              {callError && (
                <div className="mt-3 p-3 bg-red-50 text-red-500 rounded">
                  {callError}
                </div>
              )}
            </div>
          </div>
        </>
      )}


    </div>
  )
}

// Helper function to format seconds as HH:MM:SS
function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':')
}

export default MakeCall
