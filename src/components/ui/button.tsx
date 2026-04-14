import { cva, type VariantProps } from 'class-variance-authority';
import { Pressable, Text, type PressableProps } from 'react-native';

import { cn } from '@/components/ui/cn';

const buttonVariants = cva('items-center justify-center rounded-2xl px-4', {
  variants: {
    variant: {
      primary: 'bg-accent',
      secondary: 'bg-card border border-border',
      ghost: 'bg-transparent',
    },
    size: {
      default: 'h-12',
      sm: 'h-10',
      lg: 'h-14',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'default',
  },
});

const buttonTextVariants = cva('text-base font-semibold', {
  variants: {
    variant: {
      primary: 'text-accentForeground',
      secondary: 'text-foreground',
      ghost: 'text-foreground',
    },
  },
  defaultVariants: {
    variant: 'primary',
  },
});

export type ButtonProps = PressableProps &
  VariantProps<typeof buttonVariants> & {
    label?: string;
    textClassName?: string;
  };

export function Button({
  className,
  textClassName,
  variant,
  size,
  label,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      className={cn(buttonVariants({ variant, size }), disabled && 'opacity-75', className)}>
      {label ? <Text className={cn(buttonTextVariants({ variant }), textClassName)}>{label}</Text> : children}
    </Pressable>
  );
}
