import { AppError, getErrorMessage, providerHttpStatusToError } from '@/types/app-error';

describe('getErrorMessage', () => {
  test('returns app error message verbatim', () => {
    const message = getErrorMessage(new AppError('rate_limited', 'Provider said no quota'), 'fallback');
    expect(message).toBe('Provider said no quota');
  });

  test('returns generic error message verbatim', () => {
    const message = getErrorMessage(new Error('Socket closed by provider'), 'fallback');
    expect(message).toBe('Socket closed by provider');
  });

  test('falls back when no message is available', () => {
    const message = getErrorMessage({ nope: true }, 'fallback');
    expect(message).toBe('fallback');
  });
});

describe('providerHttpStatusToError', () => {
  test('maps quota-like 403 payload to rate_limited with provider message', async () => {
    const error = await providerHttpStatusToError({
      status: 403,
      text: async () =>
        JSON.stringify({
          error: {
            message: 'You exceeded your current quota, please check your plan and billing details.',
          },
        }),
    } as Response);

    expect(error).toMatchObject({
      code: 'rate_limited',
      message: expect.stringContaining('quota'),
    } satisfies Partial<AppError>);
  });

  test('maps auth-like 403 payload to auth_failed with provider message', async () => {
    const error = await providerHttpStatusToError({
      status: 403,
      text: async () =>
        JSON.stringify({
          error: {
            message: 'Model not available for your account',
          },
        }),
    } as Response);

    expect(error).toMatchObject({
      code: 'auth_failed',
      message: 'Model not available for your account',
    } satisfies Partial<AppError>);
  });

  test('maps 500 responses to network_unavailable', async () => {
    const error = await providerHttpStatusToError({
      status: 500,
      text: async () => 'upstream server error',
    } as Response);

    expect(error).toMatchObject({
      code: 'network_unavailable',
      message: 'upstream server error',
    } satisfies Partial<AppError>);
  });
});
