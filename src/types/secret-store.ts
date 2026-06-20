export interface SecretStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem?(key: string): Promise<void>;
}
