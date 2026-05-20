import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { RuntimeLimits } from '@/constants/runtime';

export function createImageStore() {
  return {
    async persistImage({ inputUri, attemptId }: { inputUri: string; attemptId: string }): Promise<{
      imageUri: string;
      thumbnailUri: string;
      imageBase64: string;
      mimeType: string;
      width: number;
      height: number;
    }> {
      const normalized = await renderImage(inputUri, RuntimeLimits.normalizedImageWidth, 0.78, true);
      const thumbnail = await renderImage(normalized.uri, RuntimeLimits.thumbnailImageWidth, 0.68, false);

      if (Platform.OS === 'web') {
        return {
          imageUri: normalized.uri,
          thumbnailUri: thumbnail.uri,
          imageBase64: normalized.base64,
          mimeType: 'image/webp',
          width: normalized.width,
          height: normalized.height,
        };
      }

      const imagesDirectory = new Directory(Paths.document, 'tolksyn', 'images') as any;
      imagesDirectory.create({ idempotent: true, intermediates: true });

      const imageFile = new File(imagesDirectory, `${attemptId}.webp`) as any;
      const thumbnailFile = new File(imagesDirectory, `${attemptId}.thumb.webp`) as any;

      (new File(normalized.uri) as any).copy(imageFile);
      (new File(thumbnail.uri) as any).copy(thumbnailFile);

      return {
        imageUri: imageFile.uri,
        thumbnailUri: thumbnailFile.uri,
        imageBase64: normalized.base64,
        mimeType: 'image/webp',
        width: normalized.width,
        height: normalized.height,
      };
    },
  };
}

async function renderImage(inputUri: string, maxWidth: number, compress: number, base64: boolean): Promise<{
  uri: string;
  base64: string;
  width: number;
  height: number;
}> {
  const saved = await ImageManipulator.manipulateAsync(
    inputUri,
    [{ resize: { width: maxWidth } }],
    {
      base64,
      compress,
      format: ImageManipulator.SaveFormat.WEBP,
    },
  );

  return {
    uri: saved.uri,
    base64: saved.base64 ?? '',
    width: saved.width,
    height: saved.height,
  };
}
