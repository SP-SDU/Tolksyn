import * as ImageManipulator from "expo-image-manipulator";

import { createImageStore } from "@/services/image-store";

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: {
    JPEG: "jpeg",
    WEBP: "webp",
  },
  manipulateAsync: jest.fn(),
}));

jest.mock("expo-file-system", () => {
  class Directory {
    uri: string;

    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }

    create = jest.fn();
  }

  class File {
    uri: string;

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts
        .map((part) => (typeof part === "string" ? part : part.uri))
        .join("/");
    }

    copy = jest.fn();
  }

  return {
    Directory,
    File,
    Paths: {
      document: "document",
    },
  };
});

describe("createImageStore", () => {
  it("persists normalized and thumbnail images as WebP", async () => {
    // Arrange
    // Two manipulator calls: normalize to 1200px, then thumbnail to 240px
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockResolvedValueOnce({
        uri: "normalized.webp",
        base64: "abc",
        width: 1200,
        height: 800,
      })
      .mockResolvedValueOnce({
        uri: "thumbnail.webp",
        base64: "thumb",
        width: 240,
        height: 160,
      });

    // Act
    const results = await createImageStore().persistImages({
      inputUris: ["input.jpg"],
      attemptId: "attempt-1",
    });
    const result = results[0];

    // Assert
    // First call resizes to 1200px max dimension
    expect(ImageManipulator.manipulateAsync).toHaveBeenNthCalledWith(
      1,
      "input.jpg",
      [{ resize: { width: 1200 } }],
      expect.objectContaining({
        compress: 0.78,
        format: ImageManipulator.SaveFormat.WEBP,
      }),
    );
    // Second call creates a compact thumbnail from the normalized output
    expect(ImageManipulator.manipulateAsync).toHaveBeenNthCalledWith(
      2,
      "normalized.webp",
      [{ resize: { width: 240 } }],
      expect.objectContaining({
        compress: 0.68,
        format: ImageManipulator.SaveFormat.WEBP,
      }),
    );
    // Output metadata reflects WebP format and attempt-based naming
    expect(result.mimeType).toBe("image/webp");
    expect(result.imageUri).toContain("attempt-1-0.webp");
    expect(result.thumbnailUri).toContain("attempt-1-0.thumb.webp");
  });
});
