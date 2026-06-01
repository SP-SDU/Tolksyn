import { useState } from "react";
import { Pressable, Text, View, type ViewProps } from "react-native";

import { cn } from "@/components/ui/cn";

/** Operators need confirm fields first, and raw model traces are for debugging failed extraction. */
export function DiagnosticDisclosure({
  label,
  children,
  className,
}: ViewProps & {
  label: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View className={cn("border-2 border-border bg-paper", className)}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        className="min-h-12 flex-row items-center justify-between px-3 py-2"
      >
        <Text className="text-sm font-black uppercase tracking-wide text-foreground">
          {label}
        </Text>
        <Text className="text-sm font-black text-foreground">
          {expanded ? "-" : "+"}
        </Text>
      </Pressable>
      {expanded ? (
        <View className="gap-3 border-t-2 border-border p-3">{children}</View>
      ) : null}
    </View>
  );
}
