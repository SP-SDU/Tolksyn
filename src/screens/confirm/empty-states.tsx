import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/button";

export function AttemptNotFound() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-sm font-black uppercase tracking-wide text-muted">
        Attempt not found.
      </Text>
    </View>
  );
}

export function MissingDraft({ onRetry }: { onRetry: () => void }) {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-center text-sm font-black uppercase tracking-wide text-muted">
        Extraction result is unavailable for this attempt.
      </Text>
      <View className="mt-4 w-full max-w-xs gap-2">
        <Button
          variant="secondary"
          label="Back"
          onPress={() => router.replace("/")}
        />
        <Button label="Try Again" onPress={onRetry} />
      </View>
    </View>
  );
}
