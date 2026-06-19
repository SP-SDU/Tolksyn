import { Text, View } from "react-native";

import { ImagePreview } from "@/components/image-preview";
import { BrutalFrame, FieldRow, StatusPill } from "@/components/ui/app-chrome";

import type { ConfirmAttempt } from "./use-session";

export function Summary({ attempt }: { attempt: ConfirmAttempt }) {
  return (
    <View className="gap-3">
      {attempt.images.length > 0 ? (
        <View className="gap-2 flex-row flex-wrap">
          {attempt.images.map((image, index) => (
            <ImagePreview
              key={`${attempt.id}-${index}`}
              uri={image.imageUri}
              accessibilityLabel={`Captured product label image for attempt ${attempt.id}`}
              className="h-[220px] flex-1 min-w-[45%] border-4 border-border bg-imageBase"
              contentFit="cover"
            />
          ))}
        </View>
      ) : (
        <View className="h-[80px] items-center justify-center border-4 border-border bg-imageBase">
          <Text className="text-sm font-semibold text-muted">
            No images for this attempt.
          </Text>
        </View>
      )}
      <BrutalFrame className="gap-2 bg-paper">
        <View className="flex-row flex-wrap gap-2">
          <StatusPill
            label={attempt.status}
            tone={attempt.status.endsWith("_failed") ? "danger" : "default"}
          />
          <StatusPill label={attempt.source} tone="info" />
          <StatusPill
            label={`Rev ${attempt.acceptedRevision + 1}`}
            tone="warning"
          />
        </View>
        <FieldRow label="Attempt" value={attempt.id} />
        <FieldRow
          label="Created"
          value={new Date(attempt.createdAt).toLocaleString()}
        />
      </BrutalFrame>
    </View>
  );
}
