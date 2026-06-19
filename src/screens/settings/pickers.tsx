import { OptionPicker } from "@/components/option-picker";

import { formatThinkingLevel } from "./format";
import type { Session } from "./use-session";

export function Pickers({ session }: { session: Session }) {
  return (
    <>
      <OptionPicker
        title="Select Provider"
        open={session.providerOpen}
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
      <OptionPicker
        title="Select Model"
        open={session.modelOpen}
        items={session.models.map((item) => ({
          id: item.id,
          label: `${item.name} (${item.id})`,
        }))}
        selectedId={session.draft.provider.model}
        onClose={() => session.setModelOpen(false)}
        onSelect={(modelId) => void session.selectModel(modelId)}
      />
      <OptionPicker
        title="Select Thinking"
        open={session.thinkingOpen}
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
    </>
  );
}
