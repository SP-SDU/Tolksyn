import { AppError } from '@/types/app-error';
import { normalizeRemoteError } from '@/api/providers/remote-extraction-shared';

describe('provider error normalization', () => {
  test('maps AbortError to timeout', () => {
    const error = normalizeRemoteError(new DOMException('Timed out', 'AbortError'));
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('timeout');
  });

  test('maps network failures to network_unavailable', () => {
    const error = normalizeRemoteError(new TypeError('Network request failed'));
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('network_unavailable');
  });

  test('maps schema parsing failures to existing app error', () => {
    const source = new AppError('schema_violation', 'bad schema');
    const error = normalizeRemoteError(source);
    expect(error).toBe(source);
  });
});
