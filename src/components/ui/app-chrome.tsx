import type { ReactNode } from "react";
import { Text, View, type ViewProps } from "react-native";

import { cn } from "@/components/ui/cn";

export function AppHeader({
  eyebrow,
  title,
  meta,
  action,
}: {
  eyebrow?: string;
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <View className="border-b-2 border-border pb-4">
      <View className="flex-row items-start justify-between gap-4">
        <View className="min-w-0 flex-1">
          {eyebrow ? (
            <Text className="text-xs font-black uppercase tracking-[2px] text-muted">
              {eyebrow}
            </Text>
          ) : null}
          <Text
            role="heading"
            accessibilityRole="header"
            className="mt-1 text-4xl font-black uppercase leading-10 text-foreground"
          >
            {title}
          </Text>
          {meta ? (
            <Text className="mt-2 text-sm font-semibold uppercase tracking-wide text-muted">
              {meta}
            </Text>
          ) : null}
        </View>
        {action ? <View className="shrink-0">{action}</View> : null}
      </View>
    </View>
  );
}

export function BrutalFrame({
  className,
  ...props
}: ViewProps & { className?: string }) {
  return (
    <View
      {...props}
      className={cn("border-2 border-border bg-card p-4", className)}
    />
  );
}

export function FieldRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "success" | "danger" | "info";
}) {
  return (
    <View className="border-t-2 border-border py-3 first:border-t-0">
      <Text className="text-xs font-black uppercase tracking-wide text-muted">
        {label}
      </Text>
      <Text
        className={cn(
          "mt-1 text-base font-semibold text-foreground",
          toneText[tone],
        )}
      >
        {value}
      </Text>
    </View>
  );
}

export function StatusPill({
  label,
  tone = "default",
  className,
}: {
  label: string;
  tone?: "default" | "warning" | "success" | "danger" | "info";
  className?: string;
}) {
  return (
    <View
      role="status"
      className={cn(
        "self-start border-2 border-border px-2 py-1",
        toneBackground[tone],
        className,
      )}
    >
      <Text className="text-xs font-black uppercase tracking-wide text-foreground">
        {label}
      </Text>
    </View>
  );
}

/** Fixed footer actions sit above the tab bar, so screens need extra bottom padding. */
export function StickyActionBar({
  className,
  ...props
}: ViewProps & { className?: string }) {
  return (
    <View
      {...props}
      className={cn(
        "border-t-2 border-border bg-background px-4 pb-5 pt-3",
        className,
      )}
    />
  );
}

const toneBackground = {
  default: "bg-panelMuted",
  warning: "bg-caution",
  success: "bg-signalBlueSoft",
  danger: "bg-danger",
  info: "bg-paper",
} as const;

const toneText = {
  default: "text-foreground",
  warning: "text-foreground",
  success: "text-signalBlue",
  danger: "text-danger",
  info: "text-muted",
} as const;
