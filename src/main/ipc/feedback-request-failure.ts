export type FeedbackRequestFailure = {
  status: number | null
  error: string
}

export function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function responseFailure(response: Response): FeedbackRequestFailure {
  return { status: response.status, error: `status ${response.status}` }
}

export function errorFailure(error: unknown): FeedbackRequestFailure {
  return { status: null, error: messageFromError(error) }
}
