import { Text, View, type TextProps, type ViewProps } from 'react-native';

import { cn } from '@/components/ui/cn';

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return <View {...props} className={cn('rounded-2xl bg-card p-4', className)} />;
}

export function CardTitle({ className, ...props }: TextProps & { className?: string }) {
  return <Text {...props} className={cn('text-lg font-bold text-foreground', className)} />;
}

export function CardDescription({ className, ...props }: TextProps & { className?: string }) {
  return <Text {...props} className={cn('text-sm text-muted', className)} />;
}
