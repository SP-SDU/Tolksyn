import { readdirSync, statSync } from "node:fs";
import path from "node:path";

describe("api route files", () => {
  test("does not keep non-route shared helpers inside app api routes", () => {
    // shared.ts files inside routes would cause Expo Router conflicts
    expect(
      listFiles(path.join(process.cwd(), "src", "app", "api")).filter((file) =>
        file.endsWith("shared.ts"),
      ),
    ).toEqual([]);
  });
});

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = path.join(directory, entry);
    return statSync(filePath).isDirectory() ? listFiles(filePath) : [filePath];
  });
}
