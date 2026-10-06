import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GoalsRepository } from "../src/storage/goalsRepository";
import type { StorageAdapter } from "../src/storage/localStorageAdapter";

class MockStorageAdapter implements StorageAdapter {
  store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
}

describe("GoalsRepository", () => {
  it("creates a goal with ladder attributes", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new GoalsRepository(adapter);

    const goal = await repo.createGoal("user1", {
      title: "Run a Marathon",
      why: "Build lifelong cardiovascular endurance",
      plan: "Weekly mileage progressive overload",
      deadline: "2026-11-01"
    });

    assert.equal(goal.title, "Run a Marathon");
    assert.equal(goal.why, "Build lifelong cardiovascular endurance");
    assert.equal(goal.status, "active");
    assert.equal(goal.actions.length, 0);
  });

  it("adds and toggles goal action steps", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new GoalsRepository(adapter);

    const goal = await repo.createGoal("user1", { title: "Publish Book" });
    const action = await repo.addAction("user1", goal.id, "Outline Chapter 1");

    assert.equal(action.text, "Outline Chapter 1");
    assert.equal(action.completed, false);

    const toggled = await repo.toggleAction("user1", goal.id, action.id);
    assert.equal(toggled.completed, true);

    const updatedGoal = await repo.getGoal("user1", goal.id);
    assert.equal(updatedGoal?.actions.length, 1);
    assert.equal(updatedGoal?.actions[0].completed, true);
  });

  it("completes a goal", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new GoalsRepository(adapter);

    const goal = await repo.createGoal("user1", { title: "Complete Marathon" });
    const completed = await repo.updateGoal("user1", goal.id, { status: "completed" });

    assert.equal(completed.status, "completed");
    assert.ok(completed.completed_at !== null);
  });

  it("isolates goals across different users", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new GoalsRepository(adapter);

    await repo.createGoal("userA", { title: "Goal A" });
    await repo.createGoal("userB", { title: "Goal B" });

    const aGoals = await repo.getGoals("userA");
    const bGoals = await repo.getGoals("userB");

    assert.equal(aGoals.length, 1);
    assert.equal(aGoals[0].title, "Goal A");
    assert.equal(bGoals.length, 1);
    assert.equal(bGoals[0].title, "Goal B");
  });
});
