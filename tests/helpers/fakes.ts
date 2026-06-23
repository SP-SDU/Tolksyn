import type { SecretStore } from "@/types/secret-store";

export function createSecretStore(seed?: Record<string, string>): SecretStore {
  const map = new Map<string, string>(Object.entries(seed ?? {}));

  return {
    async getItem(key: string): Promise<string | null> {
      return map.get(key) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      map.set(key, value);
    },
    async deleteItem(key: string): Promise<void> {
      map.delete(key);
    },
  };
}

export function sampleExtractionImages() {
  return [
    {
      imageUri: "file://img.jpg",
      imageBase64: "abc",
      mimeType: "image/jpeg",
      width: 1200,
      height: 800,
    },
  ];
}
