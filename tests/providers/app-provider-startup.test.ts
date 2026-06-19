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
      "@/services/barcode-detector",
      "@/services/capture-processing",
      "@/services/export-service",
      "@/services/gallery-import",
      "@/services/image-store",
      "@/services/manufacturer-websearch",
      "@/services/provider-oauth",
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
