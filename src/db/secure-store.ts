import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const WEB_PREFIX = 'tolksyn.';
const webSecrets = new Map<string, string>();

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(WEB_PREFIX)) {
      continue;
    }

    const value = window.localStorage.getItem(key);
    if (value !== null) {
      webSecrets.set(key, value);
    }
  }
}

export const secureSecretStore = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      const cached = webSecrets.get(key);
      if (cached != null) {
        return cached;
      }

      if (typeof window !== 'undefined') {
        const value = window.localStorage.getItem(key);
        if (value !== null) {
          webSecrets.set(key, value);
          return value;
        }
      }

      return null;
    }

    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      webSecrets.set(key, value);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value);
      }
      return;
    }

    await SecureStore.setItemAsync(key, value);
  },

  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      webSecrets.delete(key);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
      return;
    }

    await SecureStore.deleteItemAsync(key);
  },
};

export async function clearWebKeys(prefix = 'tolksyn.'): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    webSecrets.delete(key);
    window.localStorage.removeItem(key);
  }
}
