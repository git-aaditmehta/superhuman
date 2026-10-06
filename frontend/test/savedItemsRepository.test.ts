import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SavedItemsRepository } from "../src/storage/savedItemsRepository";
import type { StorageAdapter } from "../src/storage/localStorageAdapter";

class MockStorageAdapter implements StorageAdapter {
  store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
}

describe("SavedItemsRepository", () => {
  it("creates, reads, toggles read status, and deletes saved items", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new SavedItemsRepository(adapter);

    const item = await repo.saveItem("user1", {
      title: "Deep Work by Cal Newport",
      url: "https://calnewport.com/deep-work",
      description: "Rules for focused success in a distracted world",
      tags: ["focus", "books", "productivity"],
    });

    assert.equal(item.title, "Deep Work by Cal Newport");
    assert.equal(item.is_read, false);
    assert.deepEqual(item.tags, ["focus", "books", "productivity"]);

    const toggled = await repo.toggleRead("user1", item.id);
    assert.equal(toggled.is_read, true);

    const items = await repo.getItems("user1");
    assert.equal(items.length, 1);
    assert.equal(items[0].id, item.id);

    await repo.deleteItem("user1", item.id);
    const afterDelete = await repo.getItems("user1");
    assert.equal(afterDelete.length, 0);
  });
});
