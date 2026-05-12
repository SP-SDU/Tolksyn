import * as Clipboard from 'expo-clipboard';
import { Copy } from 'lucide-react-native';

import { Button, type ButtonProps } from '@/components/ui/button';

export function CopyButton({ value, onCopied, onCopyFailed, ...props }: Omit<ButtonProps, 'children' | 'label' | 'onPress'> & {
  value: string;
  onCopied?: () => void;
  onCopyFailed?: () => void;
}) {
  return (
    <Button
      {...props}
      accessibilityLabel="Copy"
      onPress={async () => {
        try {
          const copied = await Clipboard.setStringAsync(value);
          if (copied) {
            onCopied?.();
          } else {
            onCopyFailed?.();
          }
        } catch {
          onCopyFailed?.();
        }
      }}>
      <Copy size={18} color="#1a1a1a" />
    </Button>
  );
}
