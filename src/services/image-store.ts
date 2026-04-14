import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

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
      const normalized = await renderImage(inputUri, 1600);
      const thumbnail = await renderImage(normalized.uri, 320);

      if (Platform.OS === 'web') {
        return {
          imageUri: normalized.uri,
          thumbnailUri: thumbnail.uri,
          imageBase64: normalized.base64,
          mimeType: 'image/jpeg',
          width: normalized.width,
          height: normalized.height,
        };
      }

      const imagesDirectory = new Directory(Paths.document, 'tolksyn', 'images') as any;
      imagesDirectory.create({ idempotent: true, intermediates: true });

      const imageFile = new File(imagesDirectory, `${attemptId}.jpg`) as any;
      const thumbnailFile = new File(imagesDirectory, `${attemptId}.thumb.jpg`) as any;

      (new File(normalized.uri) as any).copy(imageFile);
      (new File(thumbnail.uri) as any).copy(thumbnailFile);

      return {
        imageUri: imageFile.uri,
        thumbnailUri: thumbnailFile.uri,
        imageBase64: normalized.base64,
        mimeType: 'image/jpeg',
        width: normalized.width,
        height: normalized.height,
      };
    },
  };
}

async function renderImage(inputUri: string, maxWidth: number): Promise<{
  uri: string;
  base64: string;
  width: number;
  height: number;
}> {
  const saved = await ImageManipulator.manipulateAsync(
    inputUri,
    [{ resize: { width: maxWidth } }],
    {
      base64: true,
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  return {
    uri: saved.uri,
    base64: saved.base64 ?? '',
    width: saved.width,
    height: saved.height,
  };
}
