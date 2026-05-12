import { Text, View, type TextProps, type ViewProps } from 'react-native';

import { cn } from '@/components/ui/cn';

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return <View {...props} className={cn('border-2 border-border bg-card p-4', className)} />;
}

export function CardTitle({ className, ...props }: TextProps & { className?: string }) {
  return <Text {...props} className={cn('text-lg font-black uppercase tracking-wide text-foreground', className)} />;
}

export function CardDescription({ className, ...props }: TextProps & { className?: string }) {
  return <Text {...props} className={cn('text-sm font-semibold text-muted', className)} />;
}
