import {
  formatConfirmLabel,
  formatDiagnosticsSummary,
  formatWebSearchAttemptType,
} from "@/screens/confirm/format";
import { formatThinkingLevel } from "@/screens/settings/format";

describe("screen format helpers", () => {
  test("formats confirm field labels", () => {
    expect(formatConfirmLabel("productNumber")).toBe("Product Number");
    expect(formatConfirmLabel("sku")).toBe("Sku");
  });

  test("formats web search attempt types", () => {
    expect(formatWebSearchAttemptType("exa_search")).toBe("Exa search");
  });

  test("formats diagnostics summary pluralization", () => {
    expect(formatDiagnosticsSummary(1, undefined)).toBe("1 extraction attempt");
    expect(
      formatDiagnosticsSummary(2, {
        enabled: true,
        attempts: [
          { type: "exa_search", status: "success", query: "Phoenix Contact" },
        ],
        queries: [],
        searchResults: [],
        sources: [],
        fieldChanges: [],
        conflicts: [],
        failed: false,
        durationMs: 1,
      }),
    ).toBe("2 extraction attempts, 1 websearch step");
    expect(
      formatDiagnosticsSummary(3, {
        enabled: true,
        attempts: [
          { type: "exa_search", status: "success", query: "Phoenix Contact" },
          { type: "exa_search", status: "success", query: "Phoenix Contact" },
        ],
        queries: [],
        searchResults: [],
        sources: [],
        fieldChanges: [],
        conflicts: [],
        failed: false,
        durationMs: 1,
      }),
    ).toBe("3 extraction attempts, 2 websearch steps");
  });

  test("formats thinking levels", () => {
    expect(formatThinkingLevel("xhigh")).toBe("XHigh");
    expect(formatThinkingLevel("medium")).toBe("Medium");
  });
});
