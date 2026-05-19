import { ScrollView, Text, View, type ScrollViewProps, type ViewProps } from 'react-native';

import { cn } from '@/components/ui/cn';

export function Screen({ className, ...props }: ScrollViewProps & { className?: string }) {
  return <ScrollView {...props} className="bg-background" contentContainerClassName={cn('p-4 pb-8 md:px-8', className)} />;
}

export function ScreenView({ className, ...props }: ViewProps & { className?: string }) {
  return <View {...props} className={cn('flex-1 bg-background p-4 md:px-8', className)} />;
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="mb-2 border-b-2 border-border pb-3">
      <Text className="text-4xl font-black uppercase tracking-tight text-foreground">{title}</Text>
      {subtitle ? <Text className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted">{subtitle}</Text> : null}
    </View>
  );
}
