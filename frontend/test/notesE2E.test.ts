import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotesRepository, getUserNotesStorageKey } from "../src/storage/notesRepository";
import { LocalStorageAdapter } from "../src/storage/localStorageAdapter";

describe("Local Notes Persistence End-to-End Simulation", () => {
  // Simulate window.localStorage in a clean mock
  const storage = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };

  class InMemStorageAdapter extends LocalStorageAdapter {
    override getItem(key: string): string | null {
      return mockLocalStorage.getItem(key);
    }
    override setItem(key: string, value: string): void {
      mockLocalStorage.setItem(key, value);
    }
    override removeItem(key: string): void {
      mockLocalStorage.removeItem(key);
    }
  }

  const adapter = new InMemStorageAdapter();
  const userId = "aadit-user-uuid-12345";
  const otherUserId = "second-user-uuid-67890";

  it("A. Create note -> refresh -> note remains", async () => {
    const repo1 = new NotesRepository(adapter);
    const created = await repo1.createNote(userId, {
      title: "Morning Reflection",
      content: "Focus on the essential priorities today.",
    });

    assert.equal(created.title, "Morning Reflection");
    assert.equal(created.content, "Focus on the essential priorities today.");

    // Simulate page refresh (new repository instance pointing to same storage)
    const repoRefresh = new NotesRepository(adapter);
    const notes = await repoRefresh.getNotes(userId);

    assert.equal(notes.length, 1);
    assert.equal(notes[0].id, created.id);
    assert.equal(notes[0].title, "Morning Reflection");
    assert.equal(notes[0].content, "Focus on the essential priorities today.");

    // Verify localStorage key and versioned envelope
    const raw = adapter.getItem(getUserNotesStorageKey(userId));
    assert.ok(raw);
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.notes.length, 1);
  });

  it("B. Edit note -> refresh -> edited content remains", async () => {
    const repo = new NotesRepository(adapter);
    const existing = (await repo.getNotes(userId))[0];

    await repo.updateNote(userId, existing.id, {
      content: "Deep work block at 10 AM. Updated focus.",
    });

    // Simulate page refresh
    const repoRefresh = new NotesRepository(adapter);
    const updated = await repoRefresh.getNote(userId, existing.id);

    assert.ok(updated);
    assert.equal(updated.content, "Deep work block at 10 AM. Updated focus.");
  });

  it("C. Pin note -> refresh -> pin remains", async () => {
    const repo = new NotesRepository(adapter);
    const existing = (await repo.getNotes(userId))[0];
    assert.equal(existing.is_pinned, 0);

    await repo.togglePin(userId, existing.id);

    // Simulate page refresh
    const repoRefresh = new NotesRepository(adapter);
    const updated = await repoRefresh.getNote(userId, existing.id);

    assert.ok(updated);
    assert.equal(updated.is_pinned, 1);
  });

  it("D. Delete note -> refresh -> note remains deleted", async () => {
    const repo = new NotesRepository(adapter);
    const existing = (await repo.getNotes(userId))[0];

    await repo.deleteNote(userId, existing.id);

    // Simulate page refresh
    const repoRefresh = new NotesRepository(adapter);
    const notes = await repoRefresh.getNotes(userId);

    assert.equal(notes.length, 0);
  });

  it("E. Log out -> log back in on same device -> notes remain for that user and isolate other users", async () => {
    const repo = new NotesRepository(adapter);

    // Create note for User 1
    const note1 = await repo.createNote(userId, {
      title: "Permanent Local Thought",
      content: "This stays across logout.",
    });

    // User 1 logs out. User 2 logs in.
    const repoUser2 = new NotesRepository(adapter);
    const user2Notes = await repoUser2.getNotes(otherUserId);
    assert.equal(user2Notes.length, 0, "User 2 must not see User 1 notes");

    // User 2 creates their own note
    await repoUser2.createNote(otherUserId, {
      title: "User 2 Private Thought",
      content: "Only for user 2.",
    });

    // User 2 logs out. User 1 logs back in.
    const repoUser1Relog = new NotesRepository(adapter);
    const user1Notes = await repoUser1Relog.getNotes(userId);

    assert.equal(user1Notes.length, 1);
    assert.equal(user1Notes[0].id, note1.id);
    assert.equal(user1Notes[0].title, "Permanent Local Thought");
    assert.equal(user1Notes[0].content, "This stays across logout.");
  });

  it("F. Confirm network fetch is NEVER invoked with note content", async () => {
    const networkCalls: { url: string; body?: string }[] = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      networkCalls.push({ url, body: init?.body ? String(init.body) : undefined });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    try {
      const repo = new NotesRepository(adapter);

      // Perform all operations
      const n = await repo.createNote(userId, { title: "Secret Note", content: "Top Secret Content" });
      await repo.getNotes(userId);
      await repo.updateNote(userId, n.id, { content: "Updated Secret" });
      await repo.togglePin(userId, n.id);
      await repo.deleteNote(userId, n.id);

      // Verify that NO network calls were made at all during repository actions
      assert.equal(networkCalls.length, 0, "No network requests should be made for local notes");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
