export type SurveyAnswer = {
  questionId: number
  optionId: number | null
  answerText: string | null
}

export type SurveyQuestion = {
  question_id: number
  question_text: string
  question_type: 'single_select' | 'text'
  required: boolean
  options: { option_id: number; option_text: string; requires_reason: boolean }[]
}

export function validateSurvey(questions: SurveyQuestion[], answers: SurveyAnswer[]) {
  const errors: Record<number, string> = {}
  for (const question of questions) {
    const answer = answers.find(item => item.questionId === question.question_id)
    if (question.question_type === 'text') {
      if (question.required && !answer?.answerText?.trim()) {
        errors[question.question_id] = 'Esta pregunta es obligatoria'
      }
      continue
    }
    if (answer?.optionId == null) {
      if (question.required || answer?.answerText?.trim()) {
        errors[question.question_id] = 'Selecciona una opción'
      }
      continue
    }
    const option = question.options.find(item => item.option_id === answer.optionId)
    if (!option) errors[question.question_id] = 'Selecciona una opción válida'
    else if (option.requires_reason && !answer.answerText?.trim()) {
      errors[question.question_id] = 'Esta opción requiere una explicación'
    }
  }
  return errors
}

// getRandomValues also works on an HTTP LAN origin, where randomUUID may be absent.
export function createRequestKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
