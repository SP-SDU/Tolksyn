import { AppError } from '@/types/app-error';

export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof AppError)) {
    return fallback;
  }

  switch (error.code) {
    case 'permission_denied':
      return 'Permission denied. Please grant the required access in system settings.';
    case 'network_unavailable':
      return 'Network unavailable. Check your connection and try again.';
    case 'timeout':
      return 'The request timed out. Please try again.';
    case 'auth_failed':
      return 'Authentication failed. Check your API key settings.';
    case 'schema_violation':
      return 'The provider returned data that does not match the expected schema.';
    case 'invalid_response':
      return 'The provider response could not be parsed. Please retry.';
    default:
      return fallback;
  }
}
