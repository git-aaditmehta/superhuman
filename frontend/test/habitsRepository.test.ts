import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HabitsRepository } from "../src/storage/habitsRepository";
import type { StorageAdapter } from "../src/storage/localStorageAdapter";

class MockStorageAdapter implements StorageAdapter {
  store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
}

describe("HabitsRepository", () => {
  it("creates a habit and computes initial stats", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new HabitsRepository(adapter);

    const habit = await repo.createHabit("user1", {
      name: "Morning Meditation",
      floor_action: "1 deep breath",
      cue: "After morning coffee",
      anchor: "Brush teeth"
    });

    assert.equal(habit.name, "Morning Meditation");
    assert.equal(habit.floor_action, "1 deep breath");
    assert.equal(habit.check_ins.length, 0);

    const stats = repo.computeStats(habit);
    assert.equal(stats.currentStreak, 0);
    assert.equal(stats.totalCheckIns, 0);
    assert.equal(stats.stage, "spark");
  });

  it("checks in and updates streaks and milestones", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new HabitsRepository(adapter);

    const habit = await repo.createHabit("user1", { name: "Read 10 pages" });
    const today = new Date().toISOString().split("T")[0];

    const { habit: updated, newMilestones } = await repo.checkIn("user1", habit.id, today);
    assert.equal(updated.check_ins.length, 1);
    assert.equal(updated.check_ins[0].date, today);
    assert.equal(repo.isCheckedToday(updated), true);

    const stats = repo.computeStats(updated);
    assert.equal(stats.currentStreak, 1);
    assert.equal(stats.totalCheckIns, 1);
  });

  it("applies grace day to preserve streak without fabricating check-in", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new HabitsRepository(adapter);

    const habit = await repo.createHabit("user1", { name: "Exercise" });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split("T")[0];

    const withGrace = await repo.useGraceDay("user1", habit.id, yStr);
    assert.equal(withGrace.grace_days.length, 1);
    assert.equal(withGrace.grace_days[0].date, yStr);

    const stats = repo.computeStats(withGrace);
    assert.equal(stats.graceUsedThisMonth, true);

    // Only 1 grace day allowed per month
    await assert.rejects(
      async () => await repo.useGraceDay("user1", habit.id, yStr),
      /already used this month|already applied/
    );
  });

  it("performs fresh start without deleting history", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new HabitsRepository(adapter);

    const habit = await repo.createHabit("user1", { name: "Journaling" });
    await repo.checkIn("user1", habit.id, "2026-01-01");

    const restarted = await repo.freshStart("user1", habit.id);
    assert.equal(restarted.check_ins.length, 1);
    assert.ok(restarted.cycle_start >= habit.cycle_start);
  });

  it("isolates data between users", async () => {
    const adapter = new MockStorageAdapter();
    const repo = new HabitsRepository(adapter);

    await repo.createHabit("userA", { name: "Habit A" });
    await repo.createHabit("userB", { name: "Habit B" });

    const aHabits = await repo.getHabits("userA");
    const bHabits = await repo.getHabits("userB");

    assert.equal(aHabits.length, 1);
    assert.equal(aHabits[0].name, "Habit A");
    assert.equal(bHabits.length, 1);
    assert.equal(bHabits[0].name, "Habit B");
  });
});
