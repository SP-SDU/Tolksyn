import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ImagePreview } from "@/components/image-preview";
import { AppHeader, StatusPill } from "@/components/ui/app-chrome";
import { Screen } from "@/components/ui/screen";
import { RuntimeLimits } from "@/constants/runtime";
import { useAppRuntime } from "@/providers/app-provider";

export function HistoryScreen() {
  const runtime = useAppRuntime();
  const router = useRouter();
  const [attempts, setAttempts] = useState<
    Awaited<ReturnType<typeof runtime.attempts.listRecent>>
  >([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void runtime.attempts
        .listRecent(RuntimeLimits.historyLimit)
        .then((items) => {
          if (active) {
            setAttempts(items);
          }
        });

      return () => {
        active = false;
      };
    }, [runtime]),
  );

  return (
    <Screen className="gap-3">
      <AppHeader
        eyebrow="Local"
        title="History"
        meta="Last 20 attempts kept on this device."
      />
      {!attempts.length ? (
        <View className="border-2 border-border bg-paper p-4">
          <Text className="text-sm font-black uppercase tracking-wide text-muted">
            No attempts yet.
          </Text>
        </View>
      ) : null}
      {attempts.map((attempt) => {
        const thumbnailUri =
          attempt.images[0]?.thumbnailUri ??
          attempt.images[0]?.imageUri ??
          null;

        return (
          <Pressable
            key={attempt.id}
            accessibilityRole="button"
            accessibilityLabel={`Open attempt ${attempt.id}, ${attempt.status}, captured from ${attempt.source}`}
            onPress={() =>
              router.push({
                pathname: "/confirm/[attemptId]",
                params: { attemptId: attempt.id },
              })
            }
          >
            <View className="flex-row items-stretch gap-3 border-2 border-border bg-card p-3">
              {thumbnailUri ? (
                <ImagePreview
                  uri={thumbnailUri}
                  accessibilityLabel={`Thumbnail for attempt ${attempt.id}`}
                  className="h-[78px] w-[78px] border-2 border-border bg-imageBase"
                />
              ) : (
                <View className="h-[78px] w-[78px] items-center justify-center border-2 border-border bg-imageBase">
                  <Text className="text-xs font-semibold text-muted">
                    No image
                  </Text>
                </View>
              )}
              <View className="flex-1 gap-1">
                <View className="flex-row flex-wrap gap-2">
                  <StatusPill
                    label={attempt.status}
                    tone={
                      attempt.status.endsWith("_failed") ? "danger" : "default"
                    }
                  />
                  <StatusPill label={attempt.source} tone="info" />
                </View>
                <Text className="text-base font-black uppercase tracking-tight text-foreground">
                  {attempt.id}
                </Text>
                <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {new Date(attempt.createdAt).toLocaleString()}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}
