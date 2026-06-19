import { OptionPicker } from "@/components/option-picker";

import { formatThinkingLevel } from "./format";
import type { Session } from "./use-session";

export function Pickers({ session }: { session: Session }) {
  if (session.providerOpen) {
    return (
      <OptionPicker
        title="Select Provider"
        open
        items={session.providerList.map((item) => ({
          id: item.id,
          label: `${item.name} (${item.id})`,
        }))}
        selectedId={session.id}
        query={session.query}
        onQueryChange={session.setQuery}
        onClose={() => session.setProviderOpen(false)}
        onSelect={(nextId) => void session.selectProvider(nextId)}
      />
    );
  }

  if (session.modelOpen) {
    return (
      <OptionPicker
        title="Select Model"
        open
        items={session.models.map((item) => ({
          id: item.id,
          label: `${item.name} (${item.id})`,
        }))}
        selectedId={session.draft.provider.model}
        onClose={() => session.setModelOpen(false)}
        onSelect={(modelId) => void session.selectModel(modelId)}
      />
    );
  }

  if (session.thinkingOpen) {
    return (
      <OptionPicker
        title="Select Thinking"
        open
        items={[
          { id: "__auto__", label: "Auto" },
          ...session.thinkingLevels.map((item) => ({
            id: item,
            label: formatThinkingLevel(item),
          })),
        ]}
        selectedId={session.draft.provider.modelVariant ?? "__auto__"}
        onClose={() => session.setThinkingOpen(false)}
        onSelect={(value) =>
          session.selectThinkingLevel(value === "__auto__" ? null : value)
        }
      />
    );
  }

  return null;
}
