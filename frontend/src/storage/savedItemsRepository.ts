/**
 * Saved Items repository — local-first storage for links, articles, and bookmarks.
 * Matches the Save section in the PRD sketches (§7.12).
 * AI summarization is Phase 2 only.
 */

import { BaseRepository, type BaseEntity, type VersionedEnvelope } from "./baseRepository";

export interface SavedItem extends BaseEntity {
  title: string;
  url: string;
  description: string;
  tags: string[];
  is_read: boolean;
}

export interface CreateSavedItemInput {
  title: string;
  url?: string;
  description?: string;
  tags?: string[];
}

export class SavedItemsRepository extends BaseRepository<SavedItem, SavedItem[]> {
  protected storageKeyPrefix = "saved_items";
  protected currentVersion = 1;

  protected getDefaultCollection(): SavedItem[] { return []; }

  protected migrateFromLegacy(raw: unknown[]): SavedItem[] {
    return raw.map(item => this.sanitize(item)).filter((s): s is SavedItem => s !== null);
  }

  protected validateAndMigrate(envelope: VersionedEnvelope<unknown>): SavedItem[] {
    const items = Array.isArray(envelope.data) ? envelope.data : [];
    return items.map(item => this.sanitize(item)).filter((s): s is SavedItem => s !== null);
  }

  private sanitize(item: unknown): SavedItem | null {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" && c.id.trim() ? c.id.trim() : "";
    const title = typeof c.title === "string" ? c.title : "";
    if (!id || !title) return null;
    const now = this.now();
    return {
      id, title,
      url: typeof c.url === "string" ? c.url : "",
      description: typeof c.description === "string" ? c.description : "",
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === "string") : [],
      is_read: c.is_read === true,
      created_at: typeof c.created_at === "string" ? c.created_at : now,
      updated_at: typeof c.updated_at === "string" ? c.updated_at : now,
    };
  }

  async getItems(userId: string): Promise<SavedItem[]> {
    const { data } = this.loadRaw(userId);
    return [...data].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async saveItem(userId: string, input: CreateSavedItemInput): Promise<SavedItem> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local saved items data is corrupted.");

    const now = this.now();
    const item: SavedItem = {
      id: this.newId(),
      title: input.title.trim(),
      url: input.url?.trim() ?? "",
      description: input.description?.trim() ?? "",
      tags: input.tags ?? [],
      is_read: false,
      created_at: now,
      updated_at: now,
    };
    this.save(userId, [item, ...data]);
    return item;
  }

  async toggleRead(userId: string, id: string): Promise<SavedItem> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local saved items data is corrupted.");
    const index = data.findIndex(s => s.id === id);
    if (index === -1) throw new Error("Saved item not found.");
    data[index] = { ...data[index], is_read: !data[index].is_read, updated_at: this.now() };
    this.save(userId, data);
    return data[index];
  }

  async deleteItem(userId: string, id: string): Promise<void> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local saved items data is corrupted.");
    this.save(userId, data.filter(s => s.id !== id));
  }
}

export const savedItemsRepository = new SavedItemsRepository();
