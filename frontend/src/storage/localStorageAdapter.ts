/**
 * Low-level storage adapter interface and localStorage implementation.
 * Wraps browser localStorage interactions with defensive error handling.
 */

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return null;
      }
      return window.localStorage.getItem(key);
    } catch {
      // In private browsing or restricted environments, accessing localStorage can throw SecurityError.
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        throw new Error("Local storage is unavailable in this environment.");
      }
      window.localStorage.setItem(key, value);
    } catch (error) {
      if (error instanceof DOMException && (
        error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        error.code === 22 ||
        error.code === 1014
      )) {
        throw new Error("Local storage is full on this device. Please free up space to continue.");
      }
      if (error instanceof Error) {
        throw new Error(`Unable to save to local storage: ${error.message}`);
      }
      throw new Error("Unable to save to local storage.");
    }
  }

  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore removal failures in restricted environments.
    }
  }
}

export const defaultStorageAdapter = new LocalStorageAdapter();
