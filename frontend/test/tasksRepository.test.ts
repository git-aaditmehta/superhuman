import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TasksRepository } from "../src/storage/tasksRepository";
import type { StorageAdapter } from "../src/storage/localStorageAdapter";

class MockStorageAdapter implements StorageAdapter {
  store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
}

describe("TasksRepository", () => {
  it("creates, toggles, and deletes tasks", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new TasksRepository(adapter);

    const task = await repo.createTask("user1", { text: "Review PR" });
    assert.equal(task.text, "Review PR");
    assert.equal(task.done, false);

    const toggled = await repo.toggleTask("user1", task.id);
    assert.equal(toggled.done, true);

    await repo.deleteTask("user1", task.id);
    const tasks = await repo.getTasks("user1");
    assert.equal(tasks.length, 0);
  });

  it("filters tasks by date", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new TasksRepository(adapter);

    await repo.createTask("user1", { text: "Today task", date: "2026-10-07" });
    await repo.createTask("user1", { text: "Yesterday task", date: "2026-10-06" });

    const todayTasks = await repo.getTasksForDate("user1", "2026-10-07");
    assert.equal(todayTasks.length, 1);
    assert.equal(todayTasks[0].text, "Today task");
  });
});
