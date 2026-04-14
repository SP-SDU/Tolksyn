import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const webSecrets = new Map<string, string>();

export const secureSecretStore = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return webSecrets.get(key) ?? null;
    }

    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      webSecrets.set(key, value);
      return;
    }

    await SecureStore.setItemAsync(key, value);
  },

  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      webSecrets.delete(key);
      return;
    }

    await SecureStore.deleteItemAsync(key);
  },
};
