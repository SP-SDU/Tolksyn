import { readFileSync } from "fs";
import { join } from "path";

describe("deprecated React Native APIs", () => {
  it("does not use InteractionManager", () => {
    const files = [
      "src/screens/capture/index.tsx",
      "src/screens/settings/index.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source).not.toContain("InteractionManager");
    }
  });
});
