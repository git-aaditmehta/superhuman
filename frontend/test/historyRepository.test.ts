import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HistoryRepository } from "../src/storage/historyRepository";
import type { StorageAdapter } from "../src/storage/localStorageAdapter";

class MockStorageAdapter implements StorageAdapter {
  store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
}

describe("HistoryRepository", () => {
  it("records and queries life-history events", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new HistoryRepository(adapter);

    const event = await repo.addEvent("user1", {
      type: "goal_completed",
      title: "Finished Project",
      description: "Shipped Phase 1 on time",
      date: "2026-10-07"
    });

    assert.equal(event.title, "Finished Project");
    assert.equal(event.type, "goal_completed");

    const eventsForDate = await repo.getEventsForDate("user1", "2026-10-07");
    assert.equal(eventsForDate.length, 1);
    assert.equal(eventsForDate[0].id, event.id);

    const eventsForMonth = await repo.getEventsForMonth("user1", "2026-10");
    assert.equal(eventsForMonth.length, 1);
  });

  it("records small and big wins with shortcuts", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new HistoryRepository(adapter);

    const smallWin = await repo.recordSmallWin("user1", "Walked 10k steps");
    assert.equal(smallWin.type, "small_win");
    assert.equal(smallWin.title, "Walked 10k steps");

    const bigWin = await repo.recordBigWin("user1", "Closed Seed Round");
    assert.equal(bigWin.type, "big_win");
    assert.equal(bigWin.title, "Closed Seed Round");
  });
});
