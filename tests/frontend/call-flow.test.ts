import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequestKey, validateSurvey, type SurveyQuestion } from '../../frontend/src/utils/callValidation'
import { api, ApiError } from '../../frontend/src/services/api'

const question: SurveyQuestion = {
  question_id: 1, question_text: 'Motivo', question_type: 'single_select', required: false,
  options: [
    { option_id: 10, option_text: 'Sí', requires_reason: false },
    { option_id: 11, option_text: 'Otro', requires_reason: true },
  ],
}

test('Una pregunta opcional respondida también exige el motivo de la opción', () => {
  assert.ok(validateSurvey([question], [{ questionId: 1, optionId: 11, answerText: '  ' }])[1])
  assert.deepEqual(validateSurvey([question], [{ questionId: 1, optionId: 11, answerText: 'Porque...' }]), {})
})

test('Pregunta opcional vacía permitida; obligatoria sin respuesta rechazada', () => {
  assert.deepEqual(validateSurvey([question], []), {})
  assert.ok(validateSurvey([{ ...question, required: true }], [])[1])
})

test('Rechaza opciones de otra pregunta y explicaciones sin opción', () => {
  assert.ok(validateSurvey([question], [{ questionId: 1, optionId: 99, answerText: null }])[1])
  assert.ok(validateSurvey([question], [{ questionId: 1, optionId: null, answerText: 'Motivo' }])[1])
})

test('Texto obligatorio no acepta solo espacios', () => {
  const textQuestion: SurveyQuestion = { ...question, required: true, question_type: 'text' }
  assert.ok(validateSurvey([textQuestion], [{ questionId: 1, optionId: null, answerText: ' ' }])[1])
  assert.deepEqual(validateSurvey([textQuestion], [{ questionId: 1, optionId: null, answerText: 'Respuesta' }]), {})
})

test('Claves UUID válidas sin depender de randomUUID en HTTP local', () => {
  const original = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: original.getRandomValues.bind(original) } })
  try {
    const keys = Array.from({ length: 100 }, createRequestKey)
    assert.equal(new Set(keys).size, 100)
    for (const key of keys) assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  } finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original }) }
})

test('Login conserva el mensaje del backend y usa su propio mensaje si llega HTML', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Usuario inactivo' } }), { status: 401 })
    await assert.rejects(api.auth.login('test', 'test'), /Usuario inactivo/)
    globalThis.fetch = async () => new Response('<html>Error</html>', { status: 502 })
    await assert.rejects(api.auth.login('test', 'test'), /Error al iniciar sesión/)
  } finally { globalThis.fetch = original }
})

test('Una llamada sin extensión no envía null y conserva la clave del reintento', async () => {
  const original = globalThis.fetch
  const bodies: unknown[] = []
  try {
    globalThis.fetch = async (_url, options) => {
      bodies.push(JSON.parse(String(options?.body)))
      return new Response(JSON.stringify({ attempt_id: 1, call_start: '2026-09-10T10:00:00Z' }))
    }
    const request = { idempotencyKey: createRequestKey(), campaignId: 1, assignmentId: 1, clientId: 1, contactId: 1, dialedNumber: '1234567890', dialedExtension: undefined }
    await api.calls.create(request)
    await api.calls.create(request)
    assert.deepEqual(bodies[0], bodies[1])
    assert.equal(Object.hasOwn(bodies[0] as object, 'dialedExtension'), false)
  } finally { globalThis.fetch = original }
})

test('Distingue un rechazo de validación de un fallo de conexión al iniciar', async () => {
  const original = globalThis.fetch
  const request = { idempotencyKey: createRequestKey(), campaignId: 1, assignmentId: 1, clientId: 1, contactId: 1, dialedNumber: '' }
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Número obligatorio' } }), { status: 400 })
    await assert.rejects(api.calls.create(request), error => error instanceof ApiError && error.status === 400)
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
    await assert.rejects(api.calls.create(request), error => error instanceof TypeError && !(error instanceof ApiError))
  } finally { globalThis.fetch = original }
})
