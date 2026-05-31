import { createBarcodeDetector } from "@/services/barcode-detector.web";

describe("web barcode detector", () => {
  const originalBarcodeDetector = (globalThis as { BarcodeDetector?: unknown })
    .BarcodeDetector;
  const originalImage = globalThis.Image;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector =
      originalBarcodeDetector;
    globalThis.Image = originalImage;
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    jest.restoreAllMocks();
  });

  test("uses native browser BarcodeDetector with normalized formats", async () => {
    const detect = jest
      .fn()
      .mockResolvedValue([{ format: "ean_13", rawValue: "4006381333931" }]);
    const BarcodeDetector = jest
      .fn()
      .mockImplementation(() => ({ detect })) as jest.Mock & {
      getSupportedFormats: jest.Mock;
    };
    BarcodeDetector.getSupportedFormats = jest
      .fn()
      .mockResolvedValue(["ean_13", "code_93"]);
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector =
      BarcodeDetector;
    const image = { decode: jest.fn().mockResolvedValue(undefined), src: "" };
    globalThis.Image = jest.fn(() => image) as unknown as typeof Image;
    URL.createObjectURL = jest.fn(() => "blob:barcode-image");
    URL.revokeObjectURL = jest.fn();
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(new Blob(["image"], { type: "image/jpeg" }), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    ) as unknown as typeof globalThis.fetch;

    const detector = createBarcodeDetector();
    const results = await detector.detect({
      imageUri: "https://example.com/code.jpg",
      allowedTypes: ["ean13", "code93", "upc_e"],
    });

    expect(BarcodeDetector).toHaveBeenCalledWith({
      formats: ["ean_13", "code_93"],
    });
    expect(detect).toHaveBeenCalledWith(image);
    expect(results).toEqual([{ type: "ean13", data: "4006381333931" }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:barcode-image");
  });
});
