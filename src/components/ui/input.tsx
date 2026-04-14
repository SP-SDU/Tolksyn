import { TextInput, View, Text, type TextInputProps } from 'react-native';

import { cn } from '@/components/ui/cn';

export function Input({ className, ...props }: TextInputProps & { className?: string }) {
  return (
    <TextInput
      {...props}
      className={cn(
        'rounded-xl border border-border bg-card px-3 py-3 text-foreground',
        className,
      )}
      placeholderTextColor="#94a3b8"
    />
  );
}

export function LabeledInput({
  label,
  className,
  labelClassName,
  ...props
}: TextInputProps & {
  label: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className={cn('text-sm font-semibold text-slate-700', labelClassName)}>{label}</Text>
      <Input {...props} className={className} />
    </View>
  );
}
