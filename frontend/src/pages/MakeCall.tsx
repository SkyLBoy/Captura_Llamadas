import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import { useLocation, Navigate } from 'react-router-dom'

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
  type: 'main' | 'reference1' | 'reference2' | 'mobile' | 'other'
  number: string
  extension: string | null
}

type EmailAddress = {
  email_id: number
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

type SurveyQuestion = {
  question_id: number
  question_text: string
  question_type: 'single_select' | 'text'
  required: boolean
  options: {
    option_id: number
    option_text: string
    requires_reason: boolean
  }[]
}

type SurveyData = {
  version: SurveyVersion
  questions: SurveyQuestion[]
}

// Tipo para las respuestas de encuesta
type SurveyAnswer = {
  questionId: number
  optionId: number | null
  answerText: string | null
}

type Channel = {
  channel_id: number
  campaign_id: number
  code: string
  description: string
  disposition_id: number | null
  is_active: boolean
}

const MakeCall: React.FC = () => {
  const { user } = useAuth()
  const location = useLocation()
  const { loading, error, executeApiCall } = useApi()

  // State for the call flow
  const [attempt, setAttempt] = useState<any>(null) // open attempt from GET /api/calls/open
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null)
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])

  // Form state for starting a call
  const [selectedContactPersonId, setSelectedContactPersonId] = useState<number | null>(null)
  const [selectedPhone, setSelectedPhone] = useState<PhoneNumber | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
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
    if (user) {
      loadOpenAttempt()
    }
  }, [user])

  // Load survey for the campaign when we have an attempt
  useEffect(() => {
    if (attempt && attempt.campaignId) {
      loadSurvey(attempt.campaignId)
    }
  }, [attempt])

  // Load contact details when we have state
  useEffect(() => {
    if (state) {
      loadContactDetails(state.clientId, state.campaignId)
      loadChannels(state.campaignId)
    }
  }, [state])

  // Load open attempt
  const loadOpenAttempt = useCallback(async () => {
    try {
      const result = await executeApiCall(() => api.calls.getOpen())
      setAttempt(result?.attempt ?? null)
      if (result?.attempt) {
        // Start timer
        const startTime = new Date(result.attempt.call_start).getTime()
        const now = new Date().getTime()
        const elapsed = Math.floor((now - startTime) / 1000)
        setElapsedSeconds(elapsed)
        // Start interval to update timer
        const interval = setInterval(() => {
          setElapsedSeconds(prev => prev + 1)
        }, 1000)
        return () => clearInterval(interval)
      }
    } catch (e) {
      console.error('Error loading open attempt:', e)
    }
  }, [executeApiCall])

  // Load survey for a campaign
  const loadSurvey = useCallback(async (campaignId: number) => {
    try {
      const result = await executeApiCall(() => api.surveys.getActiveVersion(campaignId))
      setSurveyData(result)
    } catch (e) {
      console.error('Error loading survey:', e)
    }
  }, [executeApiCall])

  // Load contact details (persons, phones, emails)
  const loadContactDetails = useCallback(async (clientId: number, campaignId: number) => {
    try {
      const result = await executeApiCall(() => api.contacts.getByClient(clientId, campaignId))
      setContactDetail(result)
    } catch (e) {
      console.error('Error loading contact details:', e)
    }
  }, [executeApiCall])

  // Load channels (for catalogs)
  const loadChannels = useCallback(async (campaignId: number) => {
    try {
      // Note: the catalogs endpoint returns both channels and dispositions
      // We only need channels for selection
      const result = await executeApiCall(() => api.catalogs.getByCampaign(campaignId))
      // The result from api.catalogs.getByCampaign is { channels: [], dispositions: [] }
      setChannels(result.channels || [])
    } catch (e) {
      console.error('Error loading channels:', e)
    }
  }, [executeApiCall])

  // Generate a new idempotency key
  const generateIdempotencyKey = useCallback(() => {
    const key = crypto.randomUUID()
    setIdempotencyKey(key)
    return key
  }, [])

  // Handle starting a new call
  const handleStartCall = useCallback(async (formData: CallFormData) => {
    if (!user) return
    setIsCalling(true)
    setCallError(null)

    // Generate idempotency key if not already generated for this attempt
    const key = idempotencyKey ?? generateIdempotencyKey()

    try {
      const result = await executeApiCall(() =>
        api.calls.create({
          ...formData,
          idempotencyKey: key
        })
      )

      if (result) {
        setAttempt(result)
        // Reset form state for the call (but keep idempotencyKey for potential retry of close?)
        setSelectedContactPersonId(null)
        setSelectedPhone(null)
        setIsCalling(false)
        // Note: we keep the idempotencyKey in state for the duration of the call attempt
        // It will be cleared when the call is closed or abandoned
      }
    } catch (e: any) {
      setIsCalling(false)
      setCallError(e.message || 'Error al iniciar la llamada')
      // Keep the idempotencyKey so we can retry with the same key
    }
  }, [user, executeApiCall, idempotencyKey, generateIdempotencyKey])

  // Handle closing a call
  const handleCloseCall = useCallback(async () => {
    if (!attempt || !user) return

    setCloseError(null)

    if (!selectedChannelCode) {
      setCloseError('Selecciona una canalización.')
      return
    }

    const includeSurvey = surveyCompleted || surveyDeclined

    if (includeSurvey && !surveyData) {
      setCloseError('No se ha cargado la versión de la encuesta.')
      return
    }

    const phone = newDataPhone?.trim() || undefined
    const email = newDataEmail?.trim() || undefined
    const businessName = newDataBusinessName?.trim() || undefined

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
          : surveyAnswers.map(answer => ({
              questionId: answer.questionId,
              optionId: answer.optionId ?? undefined,
              answerText: answer.answerText?.trim() || undefined,
            })),
      }
    }

    setIsClosing(true)

    try {
      const result = await executeApiCall(() =>
        api.calls.close(attempt.attempt_id, closeData)
      )

      if (result) {
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
        setIdempotencyKey(null) // Clear the idempotencyKey after successful close
        setIsClosing(false)
        // Optionally, navigate back to contact list or show success
      }
    } catch (e: any) {
      setIsClosing(false)
      setCloseError(e.message || 'Error al cerrar la llamada')
    }
  }, [attempt, user, executeApiCall, selectedChannelCode, notes, surveyData, surveyCompleted, surveyDeclined, surveyAnswers, surveyErrors, newDataPhone, newDataEmail, newDataBusinessName])

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

  // Render loading state
  if (loading && !attempt && !state) {
    return <div className="text-center py-8">Cargando...</div>
  }

  // Redirect if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // If we don't have the necessary state from ContactList, redirect
  if (!state) {
    return <div className="text-center py-8">Por favor, seleccione un contacto para llamar desde la lista de contactos.</div>
  }

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
                                  {option.requires_reason && (
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
                          // Validar respuestas antes de continuar
                          let hasError = false;
                          const newErrors: Record<number, string> = {};

                          for (const question of surveyData.questions) {
                            const answer = surveyAnswers.find(a => a.questionId === question.question_id);

                            if (question.required) {
                              if (question.question_type === 'single_select' && (!answer || answer.optionId === null)) {
                                newErrors[question.question_id] = 'Esta pregunta es obligatoria';
                                hasError = true;
                              } else if (question.question_type === 'text' && (!answer || !answer.answerText?.trim())) {
                                newErrors[question.question_id] = 'Esta pregunta es obligatoria';
                                hasError = true;
                              }

                              // Validar si se requiere explicación pero no se proporcionó
                              if (answer && question.question_type === 'single_select' && answer.optionId !== null) {
                                const selectedOption = question.options.find(o => o.option_id === answer.optionId);
                                if (selectedOption?.requires_reason && (!answer.answerText || !answer.answerText.trim())) {
                                  newErrors[question.question_id] = 'Esta opción requiere una explicación';
                                  hasError = true;
                                }
                              }
                            }
                          }

                          if (hasError) {
                            setSurveyErrors(newErrors);
                            return;
                          }

                          // Limpiar errores si todo es válido
                          setSurveyErrors({});
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

          {/* Notes and channel selection */}
          {!surveyData || surveyCompleted ? (
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
            {!surveyData || surveyCompleted ? (
              <button
                onClick={handleCloseCall}
                disabled={isClosing || !selectedChannelCode}
                className="w-auto flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {isClosing ? 'Cerrando llamada...' : 'Cerrar llamada'}
              </button>
            ) : null}
            <button
              onClick={() => {
                // Reset call state (abandon)
                setAttempt(null)
                setSurveyData(null)
                setSelectedChannelCode(null)
                setNotes('')
                setSurveyCompleted(false)
                setIdempotencyKey(null)
                // Note: we do not delete the attempt from backend, just abandon tracking
              }}
              className="w-auto flex justify-center py-2 px-4 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50"
            >
              Abandonar llamada
            </button>
          </div>
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

      {/* Form to start call */}
      {contactDetail && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Seleccione persona de contacto y teléfono</h3>

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
                        <div className="font-medium text-gray-700">{person.nombre || 'N/A'}</div>
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
                  {/*
                    Note: In a real implementation, we would need to know which phones belong to which contact person.
                    The current contact detail structure does not link phones to specific contact persons.
                    We assume all phones are for the contact (not per person). This is a simplification.
                  */}
                  {contactDetail.phones.length > 0 ? (
                    <div className="space-y-2">
                      {contactDetail.phones.map((phone) => (
                        <div key={phone.phone_id} className="flex items-center">
                          <input
                            type="radio"
                            value={phone.phone_id}
                            checked={selectedPhone?.phone_id === phone.phone_id}
                            onChange={(e) => handleSelectPhone((contactDetail.phones.find(p => p.phone_id === Number(e.target.value)) || null))}
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

            {/* Start call button */}
            <div className="mt-6">
              <button
                onClick={async () => {
                  if (!selectedContactPersonId || !selectedPhone) {
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

      {/* Error state */}
      {error && (
        <div className="bg-red-50 text-red-500 p-4 rounded mb-6">
          {error}
        </div>
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