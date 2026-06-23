import { Switch, Text, View } from "react-native";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input, LabeledInput } from "@/components/ui/input";
import { Section } from "@/components/ui/section";

import { formatThinkingLevel } from "./format";
import type { Session } from "./use-session";

export function ProviderSection({ session }: { session: Session }) {
  return (
    <Section title="Provider">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-black uppercase tracking-wide text-foreground">
          Show experimental providers
        </Text>
        <Switch
          accessibilityLabel="Show experimental providers"
          value={session.draft.provider.showExperimentalProviders}
          onValueChange={(value) =>
            session.updateDraft((next) => {
              next.provider.showExperimentalProviders = value;
            })
          }
        />
      </View>
      <ProviderModelButtons session={session} />
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
        {session.supported
          ? "Supported for extraction in this app."
          : "Configured providers are saved, but this provider is not yet supported for extraction."}
      </Text>
      <ThinkingButton session={session} />
      <LabeledInput
        label="Timeout (ms)"
        keyboardType="number-pad"
        value={String(session.draft.provider.timeoutMs)}
        onChangeText={(value) =>
          session.updateDraft((next) => {
            next.provider.timeoutMs = Number(value) || 0;
          })
        }
      />
      <AuthModeButtons session={session} />
      {session.mode === "api" ? (
        <ApiKeyInput session={session} />
      ) : (
        <OAuthPanel session={session} />
      )}
    </Section>
  );
}

function ProviderModelButtons({ session }: { session: Session }) {
  return (
    <>
      <PickerButton
        label="Provider"
        value={`${session.providerName} (${session.id})`}
        onPress={() => {
          session.setProviderOpen(true);
          session.setModelOpen(false);
          session.setThinkingOpen(false);
        }}
      />
      <PickerButton
        label="Model"
        value={session.modelName || "Select model"}
        onPress={() => {
          session.setModelOpen(true);
          session.setProviderOpen(false);
          session.setThinkingOpen(false);
        }}
      />
    </>
  );
}

function ThinkingButton({ session }: { session: Session }) {
  if (!session.thinkingLevels.length) {
    return null;
  }

  return (
    <PickerButton
      label="Thinking"
      value={
        session.draft.provider.modelVariant
          ? formatThinkingLevel(session.draft.provider.modelVariant)
          : "Auto"
      }
      onPress={() => {
        session.setThinkingOpen(true);
        session.setProviderOpen(false);
        session.setModelOpen(false);
      }}
    />
  );
}

function PickerButton({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-black uppercase tracking-wide text-foreground">
        {label}
      </Text>
      <Button
        variant="secondary"
        className="items-start"
        label={value}
        onPress={onPress}
      />
    </View>
  );
}

function AuthModeButtons({ session }: { session: Session }) {
  if (session.methods.length <= 1) {
    return null;
  }

  return (
    <View className="flex-row gap-2">
      {session.methods.map((item) => (
        <Button
          key={item}
          variant={session.mode === item ? "primary" : "secondary"}
          size="sm"
          className="flex-1"
          label={item === "api" ? "API Key" : "OAuth"}
          onPress={() => session.setMode(item)}
        />
      ))}
    </View>
  );
}

function ApiKeyInput({ session }: { session: Session }) {
  return (
    <LabeledInput
      label="API Key"
      secureTextEntry
      value={session.key}
      onChangeText={session.setApiKey}
    />
  );
}

function OAuthPanel({ session }: { session: Session }) {
  return (
    <View className="gap-3 border-2 border-border bg-paper p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-black uppercase tracking-wide text-foreground">
          OAuth
        </Text>
      </View>
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
        Starting OAuth opens a blocking browser/custom tab. Complete provider
        authorization, return here, then press Complete OAuth.
      </Text>
      {session.oauth.flow ? <OAuthFlowFields session={session} /> : null}
      {session.oauth.status ? (
        <Text className="text-xs font-semibold text-muted">
          {session.oauth.status}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          label="Start OAuth"
          disabled={session.oauth.busy}
          onPress={session.startOAuth}
        />
        <Button
          className="flex-1"
          label={session.oauth.busy ? "Waiting…" : "Complete OAuth"}
          disabled={!session.oauth.flow || session.oauth.busy}
          onPress={session.completeOAuth}
        />
      </View>
    </View>
  );
}

function OAuthFlowFields({ session }: { session: Session }) {
  return (
    <>
      <CopyableField
        label="Verification URL"
        value={session.oauth.flow?.url ?? ""}
        accessibilityLabel="OAuth verification URL"
        copyLabel="Copy verification URL"
        session={session}
      />
      <CopyableField
        label="Code"
        value={session.oauth.flow?.code ?? ""}
        accessibilityLabel="OAuth verification code"
        copyLabel="Copy OAuth verification code"
        session={session}
      />
    </>
  );
}

function CopyableField({
  label,
  value,
  accessibilityLabel,
  copyLabel,
  session,
}: {
  label: string;
  value: string;
  accessibilityLabel: string;
  copyLabel: string;
  session: Session;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-black uppercase tracking-wide text-foreground">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <Input
          value={value}
          editable={false}
          accessibilityLabel={accessibilityLabel}
          className="flex-1"
        />
        <CopyButton
          value={value}
          accessibilityLabel={copyLabel}
          variant="secondary"
          size="sm"
          className="h-12 w-12 px-0"
          onCopied={session.onCopied}
          onCopyFailed={session.onCopyFailed}
        />
      </View>
    </View>
  );
}
