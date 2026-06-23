import {
  CONFIRM_AUTOCOMPLETE_FIELDS,
  CONFIRM_ENUM_OPTIONS,
} from "@/constants/confirmation-options";

describe("confirmation options", () => {
  test("defines fixed enum choices for confirm fields", () => {
    expect(CONFIRM_ENUM_OPTIONS).toEqual({
      condition: [
        { id: "New", label: "New" },
        { id: "Used", label: "Used" },
        { id: "Refurbished", label: "Refurbished" },
        { id: "For parts", label: "For parts" },
        { id: "Not working", label: "Not working" },
      ],
      externalCondition: [
        { id: "New", label: "New" },
        { id: "Good", label: "Good" },
        { id: "Acceptable", label: "Acceptable" },
        { id: "Poor", label: "Poor" },
      ],
      workingCondition: [
        { id: "Working", label: "Working" },
        { id: "Not working", label: "Not working" },
        { id: "Untested", label: "Untested" },
      ],
      packaging: [
        { id: "Original", label: "Original" },
        { id: "Generic", label: "Generic" },
        { id: "No packaging", label: "No packaging" },
      ],
    });
  });

  test("defines fields eligible for autocomplete", () => {
    expect(CONFIRM_AUTOCOMPLETE_FIELDS).toEqual([
      "manufacturer",
      "productNumber",
      "itemCategory",
      "storagePosition",
      "itemGroup",
    ]);
  });
});
