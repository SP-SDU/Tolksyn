import { TextInput, View, Text, type TextInputProps } from 'react-native';

import { cn } from '@/components/ui/cn';

export function Input({ className, ...props }: TextInputProps & { className?: string }) {
  return (
    <TextInput
      {...props}
      className={cn(
        'min-h-12 border-2 border-border bg-paper px-3 py-3 text-base text-foreground',
        className,
      )}
      placeholderTextColor="#5f5a52"
    />
  );
}

export function LabeledInput({
  label,
  className,
  labelClassName,
  accessibilityLabel,
  ...props
}: TextInputProps & {
  label: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className={cn('text-xs font-black uppercase tracking-wide text-foreground', labelClassName)}>{label}</Text>
      <Input {...props} accessibilityLabel={accessibilityLabel ?? label} className={className} />
    </View>
  );
}
