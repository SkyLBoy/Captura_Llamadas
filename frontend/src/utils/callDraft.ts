import type { SurveyAnswer } from './callValidation'

export type CallDraft = {
  version: 1
  notes: string
  channelCode: string | null
  newDataPhone: string | null
  newDataEmail: string | null
  newDataBusinessName: string | null
  surveyVersionId: number | null
  surveyCompleted: boolean
  surveyDeclined: boolean
  surveyAnswers: SurveyAnswer[]
}

function draftKey(userId: number, attemptId: number): string {
  return `callDraft:${userId}:${attemptId}`
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function isCallDraft(value: unknown): value is CallDraft {
  if (!value || typeof value !== 'object') return false

  const draft = value as Record<string, unknown>

  if (
    draft.version !== 1 ||
    typeof draft.notes !== 'string' ||
    !isNullableString(draft.channelCode) ||
    !isNullableString(draft.newDataPhone) ||
    !isNullableString(draft.newDataEmail) ||
    !isNullableString(draft.newDataBusinessName) ||
    !(
      draft.surveyVersionId === null ||
      (
        typeof draft.surveyVersionId === 'number' &&
        Number.isInteger(draft.surveyVersionId) &&
        draft.surveyVersionId > 0
      )
    ) ||
    typeof draft.surveyCompleted !== 'boolean' ||
    typeof draft.surveyDeclined !== 'boolean' ||
    !Array.isArray(draft.surveyAnswers)
  ) {
    return false
  }

  return draft.surveyAnswers.every((value: unknown) => {
    if (!value || typeof value !== 'object') return false

    const answer = value as Record<string, unknown>

    return (
      typeof answer.questionId === 'number' &&
      Number.isInteger(answer.questionId) &&
      answer.questionId > 0 &&
      (
        answer.optionId === null ||
        (
          typeof answer.optionId === 'number' &&
          Number.isInteger(answer.optionId) &&
          answer.optionId > 0
        )
      ) &&
      isNullableString(answer.answerText)
    )
  })
}

export function loadCallDraft(
  userId: number,
  attemptId: number
): CallDraft | null {
  const saved = sessionStorage.getItem(draftKey(userId, attemptId))

  if (saved === null) return null

  const parsed: unknown = JSON.parse(saved)

  if (!isCallDraft(parsed)) {
    throw new Error('El borrador guardado tiene un formato inválido.')
  }

  return parsed
}

export function saveCallDraft(
  userId: number,
  attemptId: number,
  draft: CallDraft
): void {
  sessionStorage.setItem(
    draftKey(userId, attemptId),
    JSON.stringify(draft)
  )
}

export function removeCallDraft(
  userId: number,
  attemptId: number
): void {
  sessionStorage.removeItem(draftKey(userId, attemptId))
}