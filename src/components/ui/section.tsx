import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@/components/ui/cn';

export function Section({
  title,
  className,
  children,
  ...props
}: ViewProps & { title: string; className?: string }) {
  return (
    <View {...props} className={cn('gap-4 border-2 border-border bg-card p-4', className)}>
      <Text role="heading" accessibilityRole="header" className="text-lg font-black uppercase tracking-wide text-foreground">{title}</Text>
      {children}
    </View>
  );
}
