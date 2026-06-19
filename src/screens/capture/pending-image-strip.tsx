import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ImagePreview } from "@/components/image-preview";
import { BrutalFrame, StatusPill } from "@/components/ui/app-chrome";

import type { Session } from "./use-session";

export function PendingImageStrip({ session }: { session: Session }) {
  if (!session.pendingImages.length) {
    return null;
  }

  return (
    <BrutalFrame className="gap-2 bg-paper">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-xs font-black uppercase tracking-wide text-muted">
          Captured images
        </Text>
        <StatusPill
          label={`${session.pendingImages.length} ready`}
          tone="success"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="w-full"
        contentContainerStyle={styles.stripContent}
      >
        {session.pendingImages.map((image) => (
          <View
            key={image.id}
            className="relative h-20 w-20 shrink-0 overflow-hidden border-2 border-border bg-imageBase"
          >
            <ImagePreview
              uri={image.uri}
              accessibilityLabel="Pending image"
              className="h-20 w-20"
              style={styles.thumbnailImage}
              contentFit="cover"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove image"
              onPress={() => session.removePendingImage(image.id)}
              className="absolute right-1 top-1 h-6 w-6 items-center justify-center border-2 border-border bg-paper"
            >
              <Text className="text-xs font-black leading-4 text-foreground">
                ×
              </Text>
            </Pressable>
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add images from gallery"
          onPress={session.handleGalleryImport}
          className="h-20 w-20 shrink-0 items-center justify-center border-2 border-dashed border-border bg-background"
        >
          <Text className="text-3xl font-black leading-8 text-foreground">
            +
          </Text>
          <Text className="text-[10px] font-black uppercase leading-3 text-muted">
            Gallery
          </Text>
        </Pressable>
      </ScrollView>
    </BrutalFrame>
  );
}

const styles = StyleSheet.create({
  stripContent: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 2,
  },
  thumbnailImage: {
    width: 80,
    height: 80,
  },
});
