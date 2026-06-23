import { render } from "@testing-library/react-native";

import { Pickers } from "@/screens/settings/pickers";

jest.mock("@/components/option-picker", () => ({
  OptionPicker: () => null,
}));

describe("Settings pickers", () => {
  it("does not build closed picker item labels", () => {
    expect(() => render(<Pickers session={closedSession()} />)).not.toThrow();
  });
});

function closedSession(): any {
  return {
    providerOpen: false,
    modelOpen: false,
    thinkingOpen: false,
    providerList: [
      {
        id: "openai",
        get name() {
          throw new Error("provider label should not be built");
        },
      },
    ],
    models: [
      {
        id: "gpt-5",
        get name() {
          throw new Error("model label should not be built");
        },
      },
    ],
    thinkingLevels: ["high"],
    id: "openai",
    draft: {
      provider: {
        model: "gpt-5",
        modelVariant: null,
      },
    },
    query: "",
    setQuery: jest.fn(),
    setProviderOpen: jest.fn(),
    setModelOpen: jest.fn(),
    setThinkingOpen: jest.fn(),
    selectProvider: jest.fn(),
    selectModel: jest.fn(),
    selectThinkingLevel: jest.fn(),
  };
}
