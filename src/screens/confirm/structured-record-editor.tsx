import { Text, View } from "react-native";

import { OptionPicker } from "@/components/option-picker";
import { BrutalFrame } from "@/components/ui/app-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StructuredItem } from "@/types/item-schema";

import { CONFIRM_AUTOCOMPLETE_FIELDS } from "@/constants/confirmation-options";
import { formatConfirmLabel } from "./format";
import { CONFIRM_ENUM_OPTIONS, type Session } from "./use-session";

export function StructuredRecordEditor({ session }: { session: Session }) {
  return (
    <BrutalFrame className="gap-4">
      <Text className="text-xl font-black uppercase tracking-tight text-foreground">
        Structured Record
      </Text>
      {session.attempt?.extractionDiagnostics?.failed ? (
        <Text className="border-2 border-border bg-caution p-3 text-sm font-black uppercase tracking-wide text-foreground">
          VLM extraction failed. Fields are defaulted to null so you can edit
          and continue manually.
        </Text>
      ) : null}
      {session.editableFields.map(([key, value]) => (
        <RecordField key={key} fieldKey={key} value={value} session={session} />
      ))}
    </BrutalFrame>
  );
}

function RecordField({
  fieldKey,
  value,
  session,
}: {
  fieldKey: string;
  value: StructuredItem[keyof StructuredItem];
  session: Session;
}) {
  const isEnum =
    CONFIRM_ENUM_OPTIONS[fieldKey as keyof typeof CONFIRM_ENUM_OPTIONS] != null;
  const isAutocomplete = (
    CONFIRM_AUTOCOMPLETE_FIELDS as readonly string[]
  ).includes(fieldKey);
  const visibleSuggestions = (session.autocompleteSuggestions[fieldKey] ?? [])
    .filter((suggestion) => suggestion !== String(value ?? ""))
    .slice(0, 5);

  return (
    <View className="gap-1.5">
      <Text className="text-xs font-black uppercase tracking-wide text-foreground">
        {formatConfirmLabel(fieldKey)}
      </Text>
      {isEnum ? (
        <Button
          variant="secondary"
          className="justify-start px-3 py-3"
          textClassName="text-left text-base"
          label={
            value == null
              ? `Select ${formatConfirmLabel(fieldKey)}...`
              : String(value)
          }
          accessibilityLabel={formatConfirmLabel(fieldKey)}
          onPress={() => session.setActivePickerField(fieldKey)}
        />
      ) : (
        <View className="gap-2">
          <Input
            multiline
            accessibilityLabel={formatConfirmLabel(fieldKey)}
            value={value == null ? "" : String(value)}
            onChangeText={(nextValue) =>
              session.updateDraftField(fieldKey, nextValue)
            }
          />
          {isAutocomplete && visibleSuggestions.length ? (
            <View className="flex-row flex-wrap gap-2">
              {visibleSuggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="secondary"
                  size="sm"
                  label={suggestion}
                  onPress={() => session.selectDraftValue(fieldKey, suggestion)}
                />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function StructuredRecordPickers({ session }: { session: Session }) {
  return (
    <OptionPicker
      title={
        session.activePickerField
          ? formatConfirmLabel(session.activePickerField)
          : ""
      }
      open={session.activePickerField !== null}
      selectedId={
        session.activePickerField && session.draft
          ? String(
              session.draft[
                session.activePickerField as keyof StructuredItem
              ] ?? "",
            )
          : undefined
      }
      items={
        session.activePickerField
          ? (CONFIRM_ENUM_OPTIONS[
              session.activePickerField as keyof typeof CONFIRM_ENUM_OPTIONS
            ] ?? [])
          : []
      }
      onClose={() => session.setActivePickerField(null)}
      onSelect={(id) => {
        if (session.activePickerField) {
          session.selectDraftValue(session.activePickerField, id);
        }
        session.setActivePickerField(null);
      }}
    />
  );
}
