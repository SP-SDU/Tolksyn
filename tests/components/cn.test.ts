import { cn } from "@/components/ui/cn";

describe("cn", () => {
  test("joins conditional classes and merges tailwind conflicts", () => {
    expect(cn("px-2", false && "hidden", ["px-4", "text-sm"])).toBe(
      "px-4 text-sm",
    );
  });
});
