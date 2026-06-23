import { createExportService } from "@/services/export/export-service";
import { emptyStructuredItem } from "@/types/item-schema";
import { isAvailableAsync, shareAsync } from "expo-sharing";

let mockPlatformOS = "ios";
const mockDirectoryCreate = jest.fn();
const mockFileWrite = jest.fn();

jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "document" },
  Directory: jest.fn().mockImplementation(() => ({ create: mockDirectoryCreate })),
  File: jest.fn().mockImplementation((_dir, filename) => ({
    uri: `file://${filename}`,
    write: mockFileWrite,
  })),
}));

jest.mock("expo-sharing", () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const mockIsAvailableAsync = isAvailableAsync as jest.MockedFunction<
  typeof isAvailableAsync
>;
const mockShareAsync = shareAsync as jest.MockedFunction<typeof shareAsync>;

describe("createExportService", () => {
  beforeEach(() => {
    mockPlatformOS = "ios";
    mockDirectoryCreate.mockClear();
    mockFileWrite.mockClear();
    mockIsAvailableAsync.mockReset();
    mockShareAsync.mockReset();
    jest.restoreAllMocks();
  });

  test("exports json through browser download on web", async () => {
    mockPlatformOS = "web";
    const click = jest.fn();
    const appendChild = jest.fn();
    const removeChild = jest.fn();
    const anchor = { href: "", download: "", click };
    Object.defineProperty(globalThis, "document", {
      value: {
        createElement: jest.fn(() => anchor),
        body: { appendChild, removeChild },
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "URL", {
      value: {
        createObjectURL: jest.fn(() => "blob:export"),
        revokeObjectURL: jest.fn(),
      },
      configurable: true,
    });
    jest.spyOn(Date, "now").mockReturnValue(123);

    await createExportService().exportJson(payload());

    expect(anchor.href).toBe("blob:export");
    expect(anchor.download).toBe("tolksyn-attempt-1-123.json");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:export");
  });

  test("exports csv through native file sharing", async () => {
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockResolvedValue(undefined);
    jest.spyOn(Date, "now").mockReturnValue(456);

    await createExportService().exportCsv("attempt-1", {
      ...emptyStructuredItem(),
      manufacturer: "Siemens",
    });

    expect(mockDirectoryCreate).toHaveBeenCalledWith({
      idempotent: true,
      intermediates: true,
    });
    expect(mockFileWrite).toHaveBeenCalledWith(expect.stringContaining("Siemens"));
    expect(mockShareAsync).toHaveBeenCalledWith(
      "file://tolksyn-attempt-1-456.csv",
      {
        mimeType: "text/csv",
        dialogTitle: "Export Tolksyn Data",
      },
    );
  });

  test("throws when native sharing is unavailable", async () => {
    mockPlatformOS = "android";
    mockIsAvailableAsync.mockResolvedValue(false);

    await expect(
      createExportService().exportCsv("attempt-1", emptyStructuredItem()),
    ).rejects.toThrow("Sharing is not available on this device");
  });
});

function payload() {
  return {
    schemaVersion: "tolksyn.item.v1" as const,
    attemptId: "attempt-1",
    acceptedRevision: 1,
    structuredJson: emptyStructuredItem(),
    barcodeEnrichment: {
      detected: [],
      primary: null,
      relatedFieldSuggestions: { eanOrUpc: null },
      conflicts: [],
    },
    metadata: { source: "camera" as const },
  };
}
