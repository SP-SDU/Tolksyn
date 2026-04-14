import { importFromGallery } from '@/services/gallery-import';
import { AppError } from '@/types/app-error';

describe('importFromGallery', () => {
  test('throws permission_denied when media library permission is not granted', async () => {
    await expect(
      importFromGallery({
        requestPermission: async () => ({ granted: false }),
        launchPicker: async () => ({ canceled: true }),
      }),
    ).rejects.toMatchObject({ code: 'permission_denied' } satisfies Partial<AppError>);
  });

  test('returns null when user cancels picker', async () => {
    const result = await importFromGallery({
      requestPermission: async () => ({ granted: true }),
      launchPicker: async () => ({ canceled: true }),
    });

    expect(result).toBeNull();
  });

  test('returns selected image uri', async () => {
    const result = await importFromGallery({
      requestPermission: async () => ({ granted: true }),
      launchPicker: async () => ({
        canceled: false,
        assets: [{ uri: 'file://picked.jpg' }],
      }),
    });

    expect(result).toBe('file://picked.jpg');
  });
});
