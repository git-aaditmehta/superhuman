/**
 * Habits repository — local-first storage for habits, check-ins, streaks, and milestones.
 * Each habit has its own performance calendar (X marks).
 * Supports cue/anchor, floor action, habit stacking, and implementation intentions.
 */

import { BaseRepository, type BaseEntity, type VersionedEnvelope } from "./baseRepository";

export type HabitStage = "spark" | "foundation" | "integration" | "mastery";

export interface HabitCheckIn {
  id: string;
  date: string;       // YYYY-MM-DD
  performed: boolean;  // true = X mark
  note: string;        // optional reflection
  created_at: string;
}

export interface HabitMilestone {
  id: string;
  type: "streak";
  days: number;        // 7, 14, 21, 30, 60, 90, 365
  label: string;       // "Foundation", "Automatic", etc.
  earned_at: string;
  habit_id: string;
}

export interface HabitGrace {
  id: string;
  date: string;
  used_at: string;
}

export interface Habit extends BaseEntity {
  name: string;           // The action/behavior
  floor_action: string;   // Bad-day minimum version
  cue: string;            // Cue/context/anchor
  anchor: string;         // "After [anchor], I will [action]"
  intention: string;      // Full implementation intention
  goal_id: string | null; // Optional link to a goal
  check_ins: HabitCheckIn[];
  milestones: HabitMilestone[];
  grace_days: HabitGrace[];
  archived: boolean;
  cycle_start: string;    // When the current cycle began
}

export interface CreateHabitInput {
  name: string;
  floor_action?: string;
  cue?: string;
  anchor?: string;
  goal_id?: string | null;
}

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  totalCheckIns: number;
  stage: HabitStage;
  daysSinceStart: number;
  completionRate: number; // 0-100
  lastCheckIn: string | null;
  graceUsedThisMonth: boolean;
}

const MILESTONE_DAYS = [7, 14, 21, 30, 60, 90, 365];
const MILESTONE_LABELS: Record<number, string> = {
  7: "First Week",
  14: "Two Weeks Strong",
  21: "Foundation",
  30: "One Month",
  60: "Two Months",
  90: "Quarter Century",
  365: "One Year",
};

export class HabitsRepository extends BaseRepository<Habit, Habit[]> {
  protected storageKeyPrefix = "habits";
  protected currentVersion = 1;

  protected getDefaultCollection(): Habit[] { return []; }

  protected migrateFromLegacy(raw: unknown[]): Habit[] {
    return raw.map(item => this.sanitize(item)).filter((h): h is Habit => h !== null);
  }

  protected validateAndMigrate(envelope: VersionedEnvelope<unknown>): Habit[] {
    const items = Array.isArray(envelope.data) ? envelope.data : [];
    return items.map(item => this.sanitize(item)).filter((h): h is Habit => h !== null);
  }

  private sanitize(item: unknown): Habit | null {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" && c.id.trim() ? c.id.trim() : "";
    const name = typeof c.name === "string" ? c.name : "";
    if (!id || !name) return null;
    const now = this.now();
    return {
      id, name,
      floor_action: typeof c.floor_action === "string" ? c.floor_action : "",
      cue: typeof c.cue === "string" ? c.cue : "",
      anchor: typeof c.anchor === "string" ? c.anchor : "",
      intention: typeof c.intention === "string" ? c.intention : "",
      goal_id: typeof c.goal_id === "string" ? c.goal_id : null,
      check_ins: Array.isArray(c.check_ins) ? c.check_ins.filter((ci): ci is HabitCheckIn =>
        ci && typeof ci === "object" && typeof (ci as Record<string, unknown>).id === "string"
      ) : [],
      milestones: Array.isArray(c.milestones) ? c.milestones.filter((m): m is HabitMilestone =>
        m && typeof m === "object" && typeof (m as Record<string, unknown>).id === "string"
      ) : [],
      grace_days: Array.isArray(c.grace_days) ? c.grace_days.filter((g): g is HabitGrace =>
        g && typeof g === "object" && typeof (g as Record<string, unknown>).id === "string"
      ) : [],
      archived: c.archived === true,
      cycle_start: typeof c.cycle_start === "string" ? c.cycle_start : now,
      created_at: typeof c.created_at === "string" ? c.created_at : now,
      updated_at: typeof c.updated_at === "string" ? c.updated_at : now,
    };
  }

  async getHabits(userId: string): Promise<Habit[]> {
    const { data } = this.loadRaw(userId);
    return data.filter(h => !h.archived).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async getAllHabits(userId: string): Promise<Habit[]> {
    const { data } = this.loadRaw(userId);
    return data;
  }

  async getHabit(userId: string, id: string): Promise<Habit | null> {
    const { data } = this.loadRaw(userId);
    return data.find(h => h.id === id) ?? null;
  }

  async createHabit(userId: string, input: CreateHabitInput): Promise<Habit> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local habits data is corrupted.");

    const now = this.now();
    const anchor = input.anchor?.trim() ?? "";
    const name = input.name.trim();
    const habit: Habit = {
      id: this.newId(),
      name,
      floor_action: input.floor_action?.trim() ?? "",
      cue: input.cue?.trim() ?? "",
      anchor,
      intention: anchor ? `After ${anchor}, I will ${name.toLowerCase()}` : "",
      goal_id: input.goal_id ?? null,
      check_ins: [],
      milestones: [],
      grace_days: [],
      archived: false,
      cycle_start: now,
      created_at: now,
      updated_at: now,
    };
    this.save(userId, [habit, ...data]);
    return habit;
  }

  async checkIn(userId: string, habitId: string, date?: string, note?: string): Promise<{ habit: Habit; newMilestones: HabitMilestone[] }> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local habits data is corrupted.");

    const index = data.findIndex(h => h.id === habitId);
    if (index === -1) throw new Error("Habit not found.");

    const habit = { ...data[index] };
    const checkDate = date ?? new Date().toISOString().split("T")[0];

    // Don't double-check-in for the same date
    const existing = habit.check_ins.find(ci => ci.date === checkDate);
    if (existing) {
      return { habit, newMilestones: [] };
    }

    const checkIn: HabitCheckIn = {
      id: this.newId(),
      date: checkDate,
      performed: true,
      note: note?.trim() ?? "",
      created_at: this.now(),
    };

    habit.check_ins = [...habit.check_ins, checkIn];
    habit.updated_at = this.now();

    // Check for new milestones
    const stats = this.computeStats(habit);
    const newMilestones: HabitMilestone[] = [];
    for (const days of MILESTONE_DAYS) {
      if (stats.currentStreak >= days) {
        const alreadyEarned = habit.milestones.some(m => m.days === days);
        if (!alreadyEarned) {
          const milestone: HabitMilestone = {
            id: this.newId(),
            type: "streak",
            days,
            label: MILESTONE_LABELS[days] ?? `${days} Days`,
            earned_at: this.now(),
            habit_id: habitId,
          };
          newMilestones.push(milestone);
          habit.milestones = [...habit.milestones, milestone];
        }
      }
    }

    data[index] = habit;
    this.save(userId, data);
    return { habit, newMilestones };
  }

  async uncheckIn(userId: string, habitId: string, date: string): Promise<Habit> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local habits data is corrupted.");

    const index = data.findIndex(h => h.id === habitId);
    if (index === -1) throw new Error("Habit not found.");

    const habit = { ...data[index] };
    habit.check_ins = habit.check_ins.filter(ci => ci.date !== date);
    habit.updated_at = this.now();
    data[index] = habit;
    this.save(userId, data);
    return habit;
  }

  async updateHabit(userId: string, id: string, input: Partial<CreateHabitInput>): Promise<Habit> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local habits data is corrupted.");

    const index = data.findIndex(h => h.id === id);
    if (index === -1) throw new Error("Habit not found.");

    const habit = data[index];
    const updated: Habit = {
      ...habit,
      name: input.name !== undefined ? input.name.trim() || habit.name : habit.name,
      floor_action: input.floor_action !== undefined ? input.floor_action.trim() : habit.floor_action,
      cue: input.cue !== undefined ? input.cue.trim() : habit.cue,
      anchor: input.anchor !== undefined ? input.anchor.trim() : habit.anchor,
      goal_id: input.goal_id !== undefined ? input.goal_id : habit.goal_id,
      updated_at: this.now(),
    };
    if (updated.anchor && updated.name) {
      updated.intention = `After ${updated.anchor}, I will ${updated.name.toLowerCase()}`;
    }
    data[index] = updated;
    this.save(userId, data);
    return updated;
  }

  async archiveHabit(userId: string, id: string): Promise<void> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local habits data is corrupted.");
    const index = data.findIndex(h => h.id === id);
    if (index === -1) return;
    data[index] = { ...data[index], archived: true, updated_at: this.now() };
    this.save(userId, data);
  }

  async freshStart(userId: string, id: string): Promise<Habit> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local habits data is corrupted.");
    const index = data.findIndex(h => h.id === id);
    if (index === -1) throw new Error("Habit not found.");
    // Fresh start: reset cycle_start but PRESERVE all history
    data[index] = {
      ...data[index],
      cycle_start: this.now(),
      updated_at: this.now(),
    };
    this.save(userId, data);
    return data[index];
  }

  async useGraceDay(userId: string, habitId: string, date?: string): Promise<Habit> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local habits data is corrupted.");
    const index = data.findIndex(h => h.id === habitId);
    if (index === -1) throw new Error("Habit not found.");

    const habit = { ...data[index] };
    const graceDate = date ?? new Date().toISOString().split("T")[0];
    const thisMonth = graceDate.substring(0, 7);

    // Only one grace day per habit per 30-day period
    if (habit.grace_days.some(g => g.date.startsWith(thisMonth))) {
      throw new Error("Grace day already used this month.");
    }
    if (habit.grace_days.some(g => g.date === graceDate)) {
      throw new Error("Grace day already applied for this date.");
    }

    habit.grace_days = [...habit.grace_days, { id: this.newId(), date: graceDate, used_at: this.now() }];
    habit.updated_at = this.now();
    data[index] = habit;
    this.save(userId, data);
    return habit;
  }

  /** Check if a habit missed yesterday (no check-in and no grace day) */
  missedYesterday(habit: Habit): boolean {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split("T")[0];
    const hasCheckin = habit.check_ins.some(ci => ci.date === yStr && ci.performed);
    const hasGrace = habit.grace_days.some(g => g.date === yStr);
    // Only relevant if the habit existed before yesterday
    const startDate = habit.cycle_start.split("T")[0];
    return !hasCheckin && !hasGrace && yStr >= startDate;
  }

  computeStats(habit: Habit): HabitStats {
    const performed = habit.check_ins
      .filter(ci => ci.performed)
      .map(ci => ci.date)
      .sort();

    const today = new Date().toISOString().split("T")[0];
    const thisMonth = today.substring(0, 7);
    const graceUsedThisMonth = habit.grace_days.some(g => g.date.startsWith(thisMonth));

    if (performed.length === 0) {
      return {
        currentStreak: 0, longestStreak: 0, totalCheckIns: 0,
        stage: "spark", daysSinceStart: 0, completionRate: 0,
        lastCheckIn: null, graceUsedThisMonth,
      };
    }

    const activeDates = new Set([...performed, ...habit.grace_days.map(g => g.date)]);

    // Current streak: count backwards from today (or yesterday if today isn't checked in yet)
    let currentStreak = 0;
    const d = new Date();
    if (!activeDates.has(today)) {
      d.setDate(d.getDate() - 1);
    }
    while (true) {
      const dateStr = d.toISOString().split("T")[0];
      if (activeDates.has(dateStr)) {
        currentStreak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }

    // Longest streak
    let longestStreak = 0;
    let tempStreak = 1;
    const sortedDates = [...activeDates].sort();
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Days since start
    const startDate = new Date(habit.cycle_start);
    const daysSinceStart = Math.max(1, Math.round((Date.now() - startDate.getTime()) / 86400000));

    // Stage
    let stage: HabitStage = "spark";
    if (daysSinceStart > 66) stage = "mastery";
    else if (daysSinceStart > 21) stage = "integration";
    else if (daysSinceStart > 7) stage = "foundation";


    return {
      currentStreak,
      longestStreak,
      totalCheckIns: performed.length,
      stage,
      daysSinceStart,
      completionRate: Math.round((performed.length / daysSinceStart) * 100),
      lastCheckIn: performed[performed.length - 1] ?? null,
      graceUsedThisMonth,
    };
  }

  getCheckedDates(habit: Habit): Set<string> {
    return new Set(habit.check_ins.filter(ci => ci.performed).map(ci => ci.date));
  }

  isCheckedToday(habit: Habit): boolean {
    const today = new Date().toISOString().split("T")[0];
    return habit.check_ins.some(ci => ci.date === today && ci.performed);
  }
}

export const habitsRepository = new HabitsRepository();
