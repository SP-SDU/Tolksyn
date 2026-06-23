import { useCallback, useState } from "react";

type PendingImage = {
  id: string;
  uri: string;
  source: "camera" | "gallery";
  createdAt: number;
};

function createPendingImage(
  uri: string,
  source: "camera" | "gallery",
): PendingImage {
  return {
    id: `${source}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    uri,
    source,
    createdAt: Date.now(),
  };
}

/**
 * Users can mix camera and gallery shots before Process, and staging avoids re-import on retry.
 */
export function usePendingImages() {
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);

  const addCameraImage = useCallback((uri: string) => {
    setPendingImages((current) => [
      ...current,
      createPendingImage(uri, "camera"),
    ]);
  }, []);

  const addGalleryImages = useCallback((uris: string[]) => {
    setPendingImages((current) => [
      ...current,
      ...uris.map((uri) => createPendingImage(uri, "gallery")),
    ]);
  }, []);

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((current) => current.filter((image) => image.id !== id));
  }, []);

  const clearPendingImages = useCallback(() => {
    setPendingImages([]);
  }, []);

  const restorePendingImages = useCallback((images: PendingImage[]) => {
    setPendingImages(images);
  }, []);

  const getLastCameraImage = useCallback((): PendingImage | undefined => {
    return [...pendingImages]
      .reverse()
      .find((image) => image.source === "camera");
  }, [pendingImages]);

  const getProcessingInput = useCallback((): {
    inputUris: string[];
    source: "camera" | "gallery";
  } => {
    const inputUris = pendingImages.map((img) => img.uri);
    const source = pendingImages.every((img) => img.source === "camera")
      ? "camera"
      : "gallery"; // any gallery import marks the batch as gallery-sourced
    return { inputUris, source };
  }, [pendingImages]);

  return {
    pendingImages,
    addCameraImage,
    addGalleryImages,
    removePendingImage,
    clearPendingImages,
    restorePendingImages,
    getLastCameraImage,
    getProcessingInput,
  };
}
