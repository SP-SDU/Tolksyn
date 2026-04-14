export type AppErrorCode =
  | 'permission_denied'
  | 'timeout'
  | 'network_unavailable'
  | 'auth_failed'
  | 'rate_limited'
  | 'invalid_response'
  | 'schema_violation'
  | 'unsupported'
  | 'internal';

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
