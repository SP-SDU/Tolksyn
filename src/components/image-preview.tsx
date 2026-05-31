import { Image, type ImageProps } from "expo-image";

export function ImagePreview({
  uri,
  ...props
}: Omit<ImageProps, "source"> & { uri: string }) {
  return <Image accessibilityRole="image" {...props} source={{ uri }} />;
}
