export type AppErrorCode =
  'CONFLICT' | 'FORBIDDEN' | 'INVALID_INPUT' | 'NOT_FOUND' | 'UNEXPECTED'

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'AppError'
  }
}
