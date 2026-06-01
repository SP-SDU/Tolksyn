import { RuntimeLimits } from "@/constants/runtime";
import { Directory, File, Paths } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

type PersistedImage = {
  imageUri: string;
  thumbnailUri: string;
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
};

/** Downscaled WebP keeps vision token cost and history thumbnail load predictable on device. */
export function createImageStore() {
  return {
    async persistImages(input: {
      inputUris: string[];
      attemptId: string;
    }): Promise<PersistedImage[]> {
      return persistImages(input);
    },

    async deleteAttemptImages(attemptId: string): Promise<void> {
      return deleteAttemptImages(attemptId);
    },

    async deleteAllImages(): Promise<void> {
      return deleteAllImages();
    },
  };
}

async function persistImages({
  inputUris,
  attemptId,
}: {
  inputUris: string[];
  attemptId: string;
}): Promise<PersistedImage[]> {
  if (inputUris.length === 0) {
    throw new Error("At least one image is required.");
  }

  return Promise.all(
    inputUris.map((inputUri, index) =>
      persistSingleImage({ inputUri, attemptId, index }),
    ),
  );
}

async function persistSingleImage({
  inputUri,
  attemptId,
  index,
}: {
  inputUri: string;
  attemptId: string;
  index: number;
}): Promise<PersistedImage> {
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
    false,
  );

  const imagesDirectory = getImagesDirectory();
  imagesDirectory.create({ idempotent: true, intermediates: true });

  const imageFile = new File(imagesDirectory, `${attemptId}-${index}.webp`);
  const thumbnailFile = new File(
    imagesDirectory,
    `${attemptId}-${index}.thumb.webp`,
  );

  if (imageFile.exists) {
    imageFile.delete();
  }

  if (thumbnailFile.exists) {
    thumbnailFile.delete();
  }

  new File(normalized.uri).copy(imageFile);
  new File(thumbnail.uri).copy(thumbnailFile);

  return {
    imageUri: imageFile.uri,
    thumbnailUri: thumbnailFile.uri,
    imageBase64: normalized.base64,
    mimeType: "image/webp",
    width: normalized.width,
    height: normalized.height,
  };
}

function getImagesDirectory(): Directory {
  return new Directory(Paths.document, "tolksyn", "images");
}

async function deleteAttemptImages(attemptId: string): Promise<void> {
  try {
    const imagesDirectory = getImagesDirectory();

    if (!imagesDirectory.exists) {
      return;
    }

    for (const entry of imagesDirectory.list()) {
      if (entry instanceof File && entry.name.startsWith(`${attemptId}-`)) {
        entry.delete();
      }
    }
  } catch (error) {
    console.warn(
      "[tolksyn] Failed to delete attempt images:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function deleteAllImages(): Promise<void> {
  try {
    const imagesDirectory = getImagesDirectory();

    if (imagesDirectory.exists) {
      imagesDirectory.delete();
    }
  } catch (error) {
    console.warn(
      "[tolksyn] Failed to delete image directory:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function renderImage(
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
