/**
 * Generic versioned-envelope repository pattern for local-first storage.
 * All productivity data repositories inherit from this base.
 * 
 * Pattern: user-scoped keys, versioned JSON envelopes, defensive parsing,
 * corruption detection, and quota/private-browsing error handling.
 */

import { defaultStorageAdapter, type StorageAdapter } from "./localStorageAdapter";

export interface VersionedEnvelope<T> {
  version: number;
  data: T;
}

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export abstract class BaseRepository<_TEntity extends BaseEntity, TCollection> {
  protected adapter: StorageAdapter;
  protected abstract storageKeyPrefix: string;
  protected abstract currentVersion: number;

  constructor(adapter: StorageAdapter = defaultStorageAdapter) {
    this.adapter = adapter;
  }

  protected getUserStorageKey(userId: string): string {
    const cleanId = typeof userId === "string" ? userId.trim() : "";
    if (!cleanId) {
      throw new Error("An authenticated user ID is required to access local data.");
    }
    return `superhuman:user:${cleanId}:${this.storageKeyPrefix}`;
  }

  protected loadRaw(userId: string): { data: TCollection; isCorrupted: boolean } {
    const key = this.getUserStorageKey(userId);
    const raw = this.adapter.getItem(key);

    if (raw === null || !raw.trim()) {
      return { data: this.getDefaultCollection(), isCorrupted: false };
    }

    try {
      const parsed = JSON.parse(raw) as unknown;

      // Handle legacy unstructured arrays
      if (Array.isArray(parsed)) {
        return { data: this.migrateFromLegacy(parsed), isCorrupted: false };
      }

      if (parsed && typeof parsed === "object" && "version" in parsed && "data" in parsed) {
        const envelope = parsed as VersionedEnvelope<unknown>;
        return { data: this.validateAndMigrate(envelope), isCorrupted: false };
      }

      return { data: this.getDefaultCollection(), isCorrupted: true };
    } catch {
      return { data: this.getDefaultCollection(), isCorrupted: true };
    }
  }

  protected save(userId: string, data: TCollection): void {
    const key = this.getUserStorageKey(userId);
    const envelope: VersionedEnvelope<TCollection> = {
      version: this.currentVersion,
      data,
    };
    this.adapter.setItem(key, JSON.stringify(envelope));
  }

  protected now(): string {
    return new Date().toISOString();
  }

  protected newId(): string {
    return crypto.randomUUID();
  }

  protected abstract getDefaultCollection(): TCollection;
  protected abstract migrateFromLegacy(raw: unknown[]): TCollection;
  protected abstract validateAndMigrate(envelope: VersionedEnvelope<unknown>): TCollection;
}
