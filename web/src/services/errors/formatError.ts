// Turn an arbitrary thrown value into a user-visible string, preferring the
// server's ProblemDetails detail/title when available (sandbox-agent throws
// AcpHttpError / AcpRpcError with a structured `problem` object).

export function formatError(error: unknown, fallback = 'Something went wrong'): string {
  if (!error) return fallback

  const maybeProblem = (error as { problem?: { detail?: string; title?: string } }).problem
  if (maybeProblem?.detail) return maybeProblem.detail
  if (maybeProblem?.title) return maybeProblem.title

  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : fallback
}
