import { cva, type VariantProps } from "class-variance-authority";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, type PressableProps } from "react-native";

import { cn } from "@/components/ui/cn";
import { AppDesign } from "@/constants/theme";

const buttonVariants = cva(
  "min-h-12 items-center justify-center border-2 border-border px-4",
  {
    variants: {
      variant: {
        primary: "",
        secondary: "",
        ghost: "border-transparent bg-transparent",
        caution: "",
        ink: "",
      },
      size: {
        default: "h-12",
        sm: "h-10",
        lg: "h-14",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

const buttonTextVariants = cva("text-base font-semibold", {
  variants: {
    variant: {
      primary: "",
      secondary: "",
      ghost: "",
      caution: "",
      ink: "",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});

export type ButtonProps = PressableProps &
  VariantProps<typeof buttonVariants> & {
    label?: string;
    textClassName?: string;
  };

type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;

function getButtonBackground(variant: ButtonVariant | null | undefined) {
  if (variant === "secondary") {
    return AppDesign.color.panel;
  }

  if (variant === "ghost") {
    return "transparent";
  }

  if (variant === "caution") {
    return AppDesign.color.yellow;
  }

  if (variant === "ink") {
    return AppDesign.color.ink;
  }

  return AppDesign.color.red;
}

function getButtonTextColor(variant: ButtonVariant | null | undefined) {
  if (variant === "primary" || variant === "ink" || variant == null) {
    return AppDesign.color.paper;
  }

  return AppDesign.color.ink;
}

export function Button({
  className,
  textClassName,
  variant,
  size,
  label,
  children,
  disabled,
  style,
  onPressIn,
  onPressOut,
  accessibilityState,
  ...props
}: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedBackground = useMemo(() => {
    if (variant === "ink") {
      return AppDesign.color.yellow;
    }

    if (variant === "ghost") {
      return AppDesign.color.panelMuted;
    }

    if (variant === "caution") {
      return AppDesign.color.red;
    }

    return AppDesign.color.yellow;
  }, [variant]);

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
      }
    };
  }, []);

  const resolvedStyle =
    typeof style === "function" ? style({ pressed }) : style;

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        if (releaseTimerRef.current) {
          clearTimeout(releaseTimerRef.current);
        }
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (releaseTimerRef.current) {
          clearTimeout(releaseTimerRef.current);
        }
        // Without a short hold, quick taps never show the pressed affordance.
        releaseTimerRef.current = setTimeout(() => setPressed(false), 140);
        onPressOut?.(event);
      }}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{
        ...accessibilityState,
        disabled: Boolean(disabled),
      }}
      className={cn(buttonVariants({ variant, size }), className)}
      style={[
        {
          opacity: disabled ? 0.5 : pressed ? 0.68 : 1,
          transform: [
            { translateY: !disabled && pressed ? 4 : 0 },
            { scale: !disabled && pressed ? 0.97 : 1 },
          ],
          backgroundColor:
            !disabled && pressed
              ? pressedBackground
              : getButtonBackground(variant),
        },
        resolvedStyle,
      ]}
      testID={props.testID}
    >
      {label ? (
        <Text
          className={cn(
            buttonTextVariants({ variant }),
            "uppercase tracking-wide",
            textClassName,
          )}
          style={{ color: getButtonTextColor(variant) }}
        >
          {label}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
