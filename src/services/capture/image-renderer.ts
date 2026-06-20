import * as ImageManipulator from "expo-image-manipulator";

export type PersistedImage = {
  imageUri: string;
  thumbnailUri: string;
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
};

export async function renderImage(
  inputUri: string,
  maxWidth: number,
  compress: number,
  base64: boolean,
): Promise<{
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
    base64: saved.base64 ?? "",
    width: saved.width,
    height: saved.height,
  };
}
