import { Image, type ImageProps } from 'expo-image';

export function ImagePreview({ uri, ...props }: Omit<ImageProps, 'source'> & { uri: string }) {
  return <Image {...props} source={{ uri }} />;
}
