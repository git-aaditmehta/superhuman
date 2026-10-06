/**
 * History repository — unified life-history events for the timeline/calendar.
 * Records milestones, badges, wins, goal completions, notes, and other dated events.
 * Separate from individual habit performance calendars.
 */

import { BaseRepository, type BaseEntity, type VersionedEnvelope } from "./baseRepository";

export type HistoryEventType =
  | "habit_milestone"
  | "goal_completed"
  | "goal_created"
  | "small_win"
  | "big_win"
  | "note"
  | "badge"
  | "check_in"
  | "weekly_review"
  | "daily_reflection"
  | "fresh_start"
  | "custom";

export interface HistoryEvent extends BaseEntity {
  type: HistoryEventType;
  title: string;
  description: string;
  date: string;           // YYYY-MM-DD
  source_id: string | null; // Link to habit, goal, note, etc.
  source_type: string | null; // "habit", "goal", "note"
  metadata: Record<string, unknown>;
}

export interface CreateHistoryEventInput {
  type: HistoryEventType;
  title: string;
  description?: string;
  date?: string;
  source_id?: string;
  source_type?: string;
  metadata?: Record<string, unknown>;
}

export class HistoryRepository extends BaseRepository<HistoryEvent, HistoryEvent[]> {
  protected storageKeyPrefix = "history";
  protected currentVersion = 1;

  protected getDefaultCollection(): HistoryEvent[] { return []; }

  protected migrateFromLegacy(raw: unknown[]): HistoryEvent[] {
    return raw.map(item => this.sanitize(item)).filter((e): e is HistoryEvent => e !== null);
  }

  protected validateAndMigrate(envelope: VersionedEnvelope<unknown>): HistoryEvent[] {
    const items = Array.isArray(envelope.data) ? envelope.data : [];
    return items.map(item => this.sanitize(item)).filter((e): e is HistoryEvent => e !== null);
  }

  private sanitize(item: unknown): HistoryEvent | null {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" ? c.id : "";
    const title = typeof c.title === "string" ? c.title : "";
    if (!id || !title) return null;
    const now = this.now();
    return {
      id, title,
      type: (typeof c.type === "string" ? c.type : "custom") as HistoryEventType,
      description: typeof c.description === "string" ? c.description : "",
      date: typeof c.date === "string" ? c.date : new Date().toISOString().split("T")[0],
      source_id: typeof c.source_id === "string" ? c.source_id : null,
      source_type: typeof c.source_type === "string" ? c.source_type : null,
      metadata: (c.metadata && typeof c.metadata === "object") ? c.metadata as Record<string, unknown> : {},
      created_at: typeof c.created_at === "string" ? c.created_at : now,
      updated_at: typeof c.updated_at === "string" ? c.updated_at : now,
    };
  }

  async getEvents(userId: string): Promise<HistoryEvent[]> {
    const { data } = this.loadRaw(userId);
    return [...data].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  }

  async getEventsForDate(userId: string, date: string): Promise<HistoryEvent[]> {
    const events = await this.getEvents(userId);
    return events.filter(e => e.date === date);
  }

  async getEventsForMonth(userId: string, yearMonth: string): Promise<HistoryEvent[]> {
    const events = await this.getEvents(userId);
    return events.filter(e => e.date.startsWith(yearMonth));
  }

  async getEventsByType(userId: string, type: HistoryEventType): Promise<HistoryEvent[]> {
    const events = await this.getEvents(userId);
    return events.filter(e => e.type === type);
  }

  async addEvent(userId: string, input: CreateHistoryEventInput): Promise<HistoryEvent> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local history data is corrupted.");

    const now = this.now();
    const event: HistoryEvent = {
      id: this.newId(),
      type: input.type,
      title: input.title,
      description: input.description ?? "",
      date: input.date ?? new Date().toISOString().split("T")[0],
      source_id: input.source_id ?? null,
      source_type: input.source_type ?? null,
      metadata: input.metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    this.save(userId, [event, ...data]);
    return event;
  }

  async recordSmallWin(userId: string, title: string, description?: string): Promise<HistoryEvent> {
    return this.addEvent(userId, { type: "small_win", title, description });
  }

  async recordBigWin(userId: string, title: string, description?: string): Promise<HistoryEvent> {
    return this.addEvent(userId, { type: "big_win", title, description });
  }

  // Get dates that have events for calendar rendering
  async getActiveDates(userId: string): Promise<Map<string, number>> {
    const events = await this.getEvents(userId);
    const dateMap = new Map<string, number>();
    for (const event of events) {
      dateMap.set(event.date, (dateMap.get(event.date) ?? 0) + 1);
    }
    return dateMap;
  }

  async deleteEvent(userId: string, id: string): Promise<void> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local history data is corrupted.");
    this.save(userId, data.filter(e => e.id !== id));
  }
}

export const historyRepository = new HistoryRepository();
