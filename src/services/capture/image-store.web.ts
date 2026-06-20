import { RuntimeLimits } from "@/constants/runtime";
import { renderImage, type PersistedImage } from "@/services/capture/image-renderer";

/** Web has no durable per-app filesystem comparable to native document storage. */
export function createImageStore() {
  return {
    async persistImages(input: {
      inputUris: string[];
      attemptId: string;
    }): Promise<PersistedImage[]> {
      return persistImages(input);
    },

    async deleteAttemptImages(_attemptId: string): Promise<void> {
      return;
    },

    async deleteAllImages(): Promise<void> {
      return;
    },
  };
}

async function persistImages({
  inputUris,
}: {
  inputUris: string[];
  attemptId: string;
}): Promise<PersistedImage[]> {
  if (inputUris.length === 0) {
    throw new Error("At least one image is required.");
  }

  return Promise.all(inputUris.map((inputUri) => persistSingleImage(inputUri)));
}

async function persistSingleImage(inputUri: string): Promise<PersistedImage> {
  const normalized = await renderImage(
    inputUri,
    RuntimeLimits.normalizedImageWidth,
    0.78,
    true,
  );
  const thumbnail = await renderImage(
    normalized.uri,
    RuntimeLimits.thumbnailImageWidth,
    0.68,
    true,
  );

  const imageUri = toDataUri(normalized.base64, normalized.uri);
  const thumbnailUri = toDataUri(thumbnail.base64, imageUri);

  return {
    imageUri,
    thumbnailUri,
    imageBase64: normalized.base64,
    mimeType: "image/webp",
    width: normalized.width,
    height: normalized.height,
  };
}

function toDataUri(base64: string, fallbackUri: string): string {
  if (!base64) {
    return fallbackUri;
  }

  if (base64.startsWith("data:")) {
    return base64;
  }

  return `data:image/webp;base64,${base64}`;
}
