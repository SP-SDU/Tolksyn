import { AppError } from "@/types/app-error";

export async function importFromGallery({
  requestPermission,
  launchPicker,
}: {
  requestPermission: () => Promise<{ granted: boolean }>;
  launchPicker: () => Promise<
    | { canceled: true }
    | {
        canceled: false;
        assets: { uri: string }[];
      }
  >;
}): Promise<string[] | null> {
  const permission = await requestPermission();
  if (!permission.granted) {
    throw new AppError(
      "permission_denied",
      "Media library permission denied by user.",
    );
  }

  const result = await launchPicker();
  if (result.canceled) {
    return null;
  }

  return result.assets.map((asset) => asset.uri);
}
