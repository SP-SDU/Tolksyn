import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@/components/ui/cn';

export function Section({
  title,
  className,
  children,
  ...props
}: ViewProps & { title: string; className?: string }) {
  return (
    <View {...props} className={cn('gap-3 rounded-2xl bg-card p-4', className)}>
      <Text className="text-lg font-bold text-foreground">{title}</Text>
      {children}
    </View>
  );
}
