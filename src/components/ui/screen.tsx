import {
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/components/ui/cn";

export function Screen({
  className,
  ...props
}: ScrollViewProps & { className?: string }) {
  return (
    <ScrollView
      {...props}
      role="main"
      className="bg-background"
      contentContainerClassName={cn("p-4 pb-8 md:px-8", className)}
    />
  );
}

export function ScreenView({
  className,
  ...props
}: ViewProps & { className?: string }) {
  return (
    <View
      {...props}
      role="main"
      className={cn("flex-1 bg-background p-4 md:px-8", className)}
    />
  );
}
