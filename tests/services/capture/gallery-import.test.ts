import { importFromGallery } from "@/services/capture/gallery-import";
import { AppError } from "@/types/app-error";

describe("importFromGallery", () => {
  test("throws permission_denied when media library permission is not granted", async () => {
    // Permission denied before reaching the picker
    await expect(
      importFromGallery({
        requestPermission: async () => ({ granted: false }),
        launchPicker: async () => ({ canceled: true }),
      }),
    ).rejects.toMatchObject({
      code: "permission_denied",
      message: "Media library permission denied by user.",
    } satisfies Partial<AppError>);
  });

  test("returns null when user cancels picker", async () => {
    const result = await importFromGallery({
      requestPermission: async () => ({ granted: true }),
      launchPicker: async () => ({ canceled: true }),
    });

    // Cancellation is not an error. Return null so the caller can distinguish
    expect(result).toBeNull();
  });

  test("returns selected image uris", async () => {
    const result = await importFromGallery({
      requestPermission: async () => ({ granted: true }),
      launchPicker: async () => ({
        canceled: false,
        assets: [{ uri: "file://picked.jpg" }, { uri: "file://second.jpg" }],
      }),
    });

    expect(result).toEqual(["file://picked.jpg", "file://second.jpg"]);
  });
});
