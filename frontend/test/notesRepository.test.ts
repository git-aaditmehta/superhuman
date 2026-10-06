import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotesRepository, getUserNotesStorageKey } from "../src/storage/notesRepository";
import type { StorageAdapter } from "../src/storage/localStorageAdapter";

class MockStorageAdapter implements StorageAdapter {
  store = new Map<string, string>();
  throwOnSet = false;

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) {
      throw new Error("Local storage is full on this device. Please free up space to continue.");
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe("NotesRepository", () => {
  it("isolates storage keys by user id", () => {
    assert.equal(getUserNotesStorageKey("user123"), "superhuman:user:user123:notes");
    assert.equal(getUserNotesStorageKey("user456"), "superhuman:user:user456:notes");
    assert.throws(() => getUserNotesStorageKey(""), /authenticated user ID is required/);
  });

  it("ensures User A and User B cannot access each other's notes", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new NotesRepository(adapter);

    const noteA = await repo.createNote("userA", { title: "User A Thought", content: "Secret A" });
    const noteB = await repo.createNote("userB", { title: "User B Thought", content: "Secret B" });

    const userANotes = await repo.getNotes("userA");
    const userBNotes = await repo.getNotes("userB");

    assert.equal(userANotes.length, 1);
    assert.equal(userANotes[0].id, noteA.id);
    assert.equal(userANotes[0].title, "User A Thought");

    assert.equal(userBNotes.length, 1);
    assert.equal(userBNotes[0].id, noteB.id);
    assert.equal(userBNotes[0].title, "User B Thought");

    assert.equal(await repo.getNote("userA", noteB.id), null);
    assert.equal(await repo.getNote("userB", noteA.id), null);
  });

  it("stores notes in versioned JSON envelope", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new NotesRepository(adapter);

    await repo.createNote("user1", { title: "Envelope Test", content: "Content" });

    const raw = adapter.getItem("superhuman:user:user1:notes");
    assert.ok(raw);
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 1);
    assert.ok(Array.isArray(parsed.notes));
    assert.equal(parsed.notes.length, 1);
    assert.equal(parsed.notes[0].title, "Envelope Test");
  });

  it("sorts pinned notes first, then by updated_at descending", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new NotesRepository(adapter);

    const n1 = await repo.createNote("user1", { title: "Note 1" });
    const n2 = await repo.createNote("user1", { title: "Note 2" });
    const n3 = await repo.createNote("user1", { title: "Note 3", is_pinned: 1 });

    const list = await repo.getNotes("user1");
    assert.equal(list[0].id, n3.id); // pinned note first
    assert.equal(list[1].id, n2.id); // n2 created after n1
    assert.equal(list[2].id, n1.id);
  });

  it("supports togglePin, updateNote, and deleteNote", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new NotesRepository(adapter);

    const note = await repo.createNote("user1", { title: "Original Title", content: "Original Content" });
    assert.equal(note.is_pinned, 0);

    const pinned = await repo.togglePin("user1", note.id);
    assert.equal(pinned.is_pinned, 1);

    const updated = await repo.updateNote("user1", note.id, { title: "Updated Title" });
    assert.equal(updated.title, "Updated Title");
    assert.equal(updated.content, "Original Content");
    assert.equal(updated.is_pinned, 1);

    await repo.deleteNote("user1", note.id);
    const remaining = await repo.getNotes("user1");
    assert.equal(remaining.length, 0);
  });

  it("handles missing key, empty string, and corrupted storage defensively", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new NotesRepository(adapter);

    // Missing key
    assert.deepEqual(await repo.getNotes("nonexistent"), []);

    // Empty string
    adapter.setItem("superhuman:user:emptyUser:notes", "   ");
    assert.deepEqual(await repo.getNotes("emptyUser"), []);

    // Corrupted JSON - getNotes returns [] without crashing
    adapter.setItem("superhuman:user:corruptUser:notes", "{not-valid-json");
    assert.deepEqual(await repo.getNotes("corruptUser"), []);

    // And createNote refuses to silently overwrite corrupted storage
    await assert.rejects(
      () => repo.createNote("corruptUser", { title: "Crash Test" }),
      /Local notes data is corrupted/
    );
  });

  it("handles quota exceeded error cleanly", async () => {
    const adapter = new MockStorageAdapter();
    adapter.throwOnSet = true;
    const repo = new NotesRepository(adapter);

    await assert.rejects(
      () => repo.createNote("user1", { title: "Will Fail" }),
      /Local storage is full on this device/
    );
  });
});
