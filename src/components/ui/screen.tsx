import { ScrollView, Text, View, type ScrollViewProps, type ViewProps } from 'react-native';

import { cn } from '@/components/ui/cn';

export function Screen({ className, ...props }: ScrollViewProps & { className?: string }) {
  return <ScrollView {...props} contentContainerClassName={cn('bg-background p-4 pb-8', className)} />;
}

export function ScreenView({ className, ...props }: ViewProps & { className?: string }) {
  return <View {...props} className={cn('flex-1 bg-background p-4', className)} />;
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="mb-2 gap-1">
      <Text className="text-3xl font-extrabold text-foreground">{title}</Text>
      {subtitle ? <Text className="text-sm text-muted">{subtitle}</Text> : null}
    </View>
  );
}
