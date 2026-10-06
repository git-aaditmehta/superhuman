import { defaultStorageAdapter, type StorageAdapter } from "./localStorageAdapter";

export interface Note {
  id: string;
  title: string;
  content: string;
  is_pinned: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface NotesEnvelope {
  version: 1;
  notes: Note[];
}

export interface CreateNoteInput {
  title: string;
  content?: string;
  is_pinned?: number | boolean;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  is_pinned?: number | boolean;
}

export const STORAGE_VERSION = 1;

export function getUserNotesStorageKey(userId: string): string {
  const cleanId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanId) {
    throw new Error("An authenticated user ID is required to access local notes.");
  }
  return `superhuman:user:${cleanId}:notes`;
}

function sanitizeNote(item: unknown): Note | null {
  if (!item || typeof item !== "object") return null;
  const candidate = item as Record<string, unknown>;
  const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : "";
  const title = typeof candidate.title === "string" ? candidate.title : "";
  if (!id || !title) return null;

  const content = typeof candidate.content === "string" ? candidate.content : "";
  const is_pinned = candidate.is_pinned === 1 || candidate.is_pinned === true ? 1 : 0;
  const now = new Date().toISOString();
  const created_at = typeof candidate.created_at === "string" && candidate.created_at ? candidate.created_at : now;
  const updated_at = typeof candidate.updated_at === "string" && candidate.updated_at ? candidate.updated_at : created_at;

  return {
    id,
    title,
    content,
    is_pinned,
    created_at,
    updated_at,
  };
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.is_pinned - a.is_pinned || b.updated_at.localeCompare(a.updated_at));
}

export class NotesRepository {
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter = defaultStorageAdapter) {
    this.adapter = adapter;
  }

  private loadRawEnvelope(userId: string): { envelope: NotesEnvelope; isCorrupted: boolean } {
    const key = getUserNotesStorageKey(userId);
    const raw = this.adapter.getItem(key);

    if (raw === null || !raw.trim()) {
      return { envelope: { version: STORAGE_VERSION, notes: [] }, isCorrupted: false };
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        // Legacy un-enveloped array format: gracefully convert
        const sanitized = parsed.map(sanitizeNote).filter((n): n is Note => n !== null);
        return { envelope: { version: STORAGE_VERSION, notes: sanitized }, isCorrupted: false };
      }

      if (parsed && typeof parsed === "object" && "version" in parsed && "notes" in parsed) {
        const candidate = parsed as { version?: unknown; notes?: unknown };
        const rawNotes = Array.isArray(candidate.notes) ? candidate.notes : [];
        const sanitized = rawNotes.map(sanitizeNote).filter((n): n is Note => n !== null);
        return { envelope: { version: STORAGE_VERSION, notes: sanitized }, isCorrupted: false };
      }

      // Stored data is an object but neither an envelope nor array
      return { envelope: { version: STORAGE_VERSION, notes: [] }, isCorrupted: true };
    } catch {
      // Unparseable JSON in storage
      return { envelope: { version: STORAGE_VERSION, notes: [] }, isCorrupted: true };
    }
  }

  private saveEnvelope(userId: string, notes: Note[]): void {
    const key = getUserNotesStorageKey(userId);
    const envelope: NotesEnvelope = {
      version: STORAGE_VERSION,
      notes: sortNotes(notes),
    };
    this.adapter.setItem(key, JSON.stringify(envelope));
  }

  async getNotes(userId: string): Promise<Note[]> {
    const { envelope } = this.loadRawEnvelope(userId);
    return sortNotes(envelope.notes);
  }

  async getNote(userId: string, id: string): Promise<Note | null> {
    const notes = await this.getNotes(userId);
    return notes.find((note) => note.id === id) ?? null;
  }

  async createNote(userId: string, input: CreateNoteInput): Promise<Note> {
    const { envelope, isCorrupted } = this.loadRawEnvelope(userId);
    if (isCorrupted) {
      throw new Error("Local notes data is corrupted. To prevent data loss, please inspect your browser storage before saving new notes.");
    }

    const title = input.title.trim();
    if (!title && !input.content?.trim()) {
      throw new Error("A note title or content is required.");
    }

    const now = new Date().toISOString();
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: title || "Untitled thought",
      content: input.content ?? "",
      is_pinned: input.is_pinned === 1 || input.is_pinned === true ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    const nextNotes = [newNote, ...envelope.notes];
    this.saveEnvelope(userId, nextNotes);
    return newNote;
  }

  async updateNote(userId: string, id: string, input: UpdateNoteInput): Promise<Note> {
    const { envelope, isCorrupted } = this.loadRawEnvelope(userId);
    if (isCorrupted) {
      throw new Error("Local notes data is corrupted. To prevent data loss, refusing to update note.");
    }

    const existingIndex = envelope.notes.findIndex((n) => n.id === id);
    if (existingIndex === -1) {
      throw new Error("Note not found in local storage.");
    }

    const existing = envelope.notes[existingIndex];
    const now = new Date().toISOString();

    const updated: Note = {
      ...existing,
      title: input.title !== undefined ? (input.title.trim() || existing.title) : existing.title,
      content: input.content !== undefined ? input.content : existing.content,
      is_pinned: input.is_pinned !== undefined ? (input.is_pinned === 1 || input.is_pinned === true ? 1 : 0) : existing.is_pinned,
      updated_at: now,
    };

    const nextNotes = [...envelope.notes];
    nextNotes[existingIndex] = updated;
    this.saveEnvelope(userId, nextNotes);
    return updated;
  }

  async deleteNote(userId: string, id: string): Promise<void> {
    const { envelope, isCorrupted } = this.loadRawEnvelope(userId);
    if (isCorrupted) {
      throw new Error("Local notes data is corrupted. Refusing to overwrite storage.");
    }

    const nextNotes = envelope.notes.filter((n) => n.id !== id);
    this.saveEnvelope(userId, nextNotes);
  }

  async togglePin(userId: string, id: string): Promise<Note> {
    const note = await this.getNote(userId, id);
    if (!note) {
      throw new Error("Note not found in local storage.");
    }
    return this.updateNote(userId, id, { is_pinned: note.is_pinned === 1 ? 0 : 1 });
  }
}

export const notesRepository = new NotesRepository();
