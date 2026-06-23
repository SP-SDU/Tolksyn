import { readFileSync } from "fs";
import { join } from "path";

describe("AppRuntimeProvider startup", () => {
  test("does not eagerly import mobile capture and export modules", () => {
    const source = readFileSync(
      join(process.cwd(), "src/providers/app-provider.tsx"),
      "utf8",
    );
    const eagerImports = [
      "expo-image-picker",
      "@/services/capture/barcode-detector",
      "@/services/capture/capture-processing",
      "@/services/capture/gallery-import",
      "@/services/capture/image-store",
      "@/services/export/export-service",
      "@/services/extraction/manufacturer-websearch",
      "@/services/providers/provider-oauth",
    ];

    for (const moduleName of eagerImports) {
      expect(source).not.toMatch(
        new RegExp(`^import .+ from ["']${escapeRegex(moduleName)}["'];?$`, "m"),
      );
    }
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
