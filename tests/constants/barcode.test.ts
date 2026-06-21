import {
  EXPO_TO_WEB_BARCODE_TYPE,
  SUPPORTED_BARCODE_TYPES,
  WEB_TO_EXPO_BARCODE_TYPE,
} from "@/constants/barcode";

describe("barcode constants", () => {
  test("supports every barcode type with a web detector mapping", () => {
    expect(SUPPORTED_BARCODE_TYPES).toEqual([
      "ean13",
      "ean8",
      "upc_a",
      "upc_e",
      "code128",
      "code39",
      "code93",
      "codabar",
      "datamatrix",
      "aztec",
      "itf14",
      "qr",
      "pdf417",
    ]);
    expect(EXPO_TO_WEB_BARCODE_TYPE).toEqual({
      aztec: "aztec",
      codabar: "codabar",
      code39: "code_39",
      code93: "code_93",
      code128: "code_128",
      datamatrix: "data_matrix",
      ean8: "ean_8",
      ean13: "ean_13",
      itf14: "itf",
      pdf417: "pdf417",
      qr: "qr_code",
      upc_a: "upc_a",
      upc_e: "upc_e",
    });
  });

  test("maps browser barcode formats back to expo barcode types", () => {
    expect(Object.fromEntries(WEB_TO_EXPO_BARCODE_TYPE)).toEqual({
      aztec: "aztec",
      codabar: "codabar",
      code_39: "code39",
      code_93: "code93",
      code_128: "code128",
      data_matrix: "datamatrix",
      ean_8: "ean8",
      ean_13: "ean13",
      itf: "itf14",
      pdf417: "pdf417",
      qr_code: "qr",
      upc_a: "upc_a",
      upc_e: "upc_e",
    });
  });
});
