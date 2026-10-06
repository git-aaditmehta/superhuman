/**
 * Goals repository — local-first storage for the L1-L4 goal ladder.
 * Stores goals with title, why, deadline, plan, actions, status, and progress.
 */

import { BaseRepository, type BaseEntity, type VersionedEnvelope } from "./baseRepository";

export type GoalStatus = "active" | "completed" | "archived";

export interface GoalAction {
  id: string;
  text: string;
  completed: boolean;
  at: string;
}

export interface Goal extends BaseEntity {
  title: string;        // L1 - The goal
  why: string;          // Why it matters
  deadline: string;     // L2 - The deadline
  plan: string;         // L3 - The plan/strategy
  actions: GoalAction[]; // L4 - Actions taken
  status: GoalStatus;
  completed_at: string | null;
}

export interface CreateGoalInput {
  title: string;
  why?: string;
  deadline?: string;
  plan?: string;
}

export interface UpdateGoalInput {
  title?: string;
  why?: string;
  deadline?: string;
  plan?: string;
  status?: GoalStatus;
}

export class GoalsRepository extends BaseRepository<Goal, Goal[]> {
  protected storageKeyPrefix = "goals";
  protected currentVersion = 1;

  protected getDefaultCollection(): Goal[] {
    return [];
  }

  protected migrateFromLegacy(raw: unknown[]): Goal[] {
    return raw.map(item => this.sanitize(item)).filter((g): g is Goal => g !== null);
  }

  protected validateAndMigrate(envelope: VersionedEnvelope<unknown>): Goal[] {
    const items = Array.isArray(envelope.data) ? envelope.data : [];
    return items.map(item => this.sanitize(item)).filter((g): g is Goal => g !== null);
  }

  private sanitize(item: unknown): Goal | null {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" && c.id.trim() ? c.id.trim() : "";
    const title = typeof c.title === "string" ? c.title : "";
    if (!id || !title) return null;
    const now = this.now();
    return {
      id,
      title,
      why: typeof c.why === "string" ? c.why : "",
      deadline: typeof c.deadline === "string" ? c.deadline : "",
      plan: typeof c.plan === "string" ? c.plan : (typeof c.strategy === "string" ? (c.strategy as string) : ""),
      actions: Array.isArray(c.actions) ? c.actions.map((a: unknown) => this.sanitizeAction(a)).filter((a): a is GoalAction => a !== null) : [],
      status: (c.status === "completed" || c.status === "archived") ? c.status : "active",
      completed_at: typeof c.completed_at === "string" ? c.completed_at : null,
      created_at: typeof c.created_at === "string" ? c.created_at : (typeof c.createdAt === "string" ? (c.createdAt as string) : now),
      updated_at: typeof c.updated_at === "string" ? c.updated_at : now,
    };
  }

  private sanitizeAction(item: unknown): GoalAction | null {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    return {
      id: typeof c.id === "string" ? c.id : crypto.randomUUID(),
      text: typeof c.text === "string" ? c.text : "",
      completed: c.completed === true,
      at: typeof c.at === "string" ? c.at : new Date().toISOString(),
    };
  }

  async getGoals(userId: string): Promise<Goal[]> {
    const { data } = this.loadRaw(userId);
    return [...data].sort((a, b) => {
      // Active first, then completed, then archived
      const statusOrder = { active: 0, completed: 1, archived: 2 };
      const diff = statusOrder[a.status] - statusOrder[b.status];
      if (diff !== 0) return diff;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }

  async getGoal(userId: string, id: string): Promise<Goal | null> {
    const goals = await this.getGoals(userId);
    return goals.find(g => g.id === id) ?? null;
  }

  async createGoal(userId: string, input: CreateGoalInput): Promise<Goal> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local goals data is corrupted.");

    const now = this.now();
    const goal: Goal = {
      id: this.newId(),
      title: input.title.trim(),
      why: input.why?.trim() ?? "",
      deadline: input.deadline ?? "",
      plan: input.plan?.trim() ?? "",
      actions: [],
      status: "active",
      completed_at: null,
      created_at: now,
      updated_at: now,
    };
    this.save(userId, [goal, ...data]);
    return goal;
  }

  async updateGoal(userId: string, id: string, input: UpdateGoalInput): Promise<Goal> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local goals data is corrupted.");

    const index = data.findIndex(g => g.id === id);
    if (index === -1) throw new Error("Goal not found.");

    const existing = data[index];
    const now = this.now();
    const updated: Goal = {
      ...existing,
      title: input.title !== undefined ? input.title.trim() || existing.title : existing.title,
      why: input.why !== undefined ? input.why : existing.why,
      deadline: input.deadline !== undefined ? input.deadline : existing.deadline,
      plan: input.plan !== undefined ? input.plan : existing.plan,
      status: input.status ?? existing.status,
      completed_at: input.status === "completed" && !existing.completed_at ? now : existing.completed_at,
      updated_at: now,
    };
    data[index] = updated;
    this.save(userId, data);
    return updated;
  }

  async addAction(userId: string, goalId: string, text: string): Promise<GoalAction> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local goals data is corrupted.");

    const index = data.findIndex(g => g.id === goalId);
    if (index === -1) throw new Error("Goal not found.");

    const action: GoalAction = {
      id: this.newId(),
      text: text.trim(),
      completed: false,
      at: this.now(),
    };
    data[index] = {
      ...data[index],
      actions: [...data[index].actions, action],
      updated_at: this.now(),
    };
    this.save(userId, data);
    return action;
  }

  async toggleAction(userId: string, goalId: string, actionId: string): Promise<GoalAction> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local goals data is corrupted.");

    const index = data.findIndex(g => g.id === goalId);
    if (index === -1) throw new Error("Goal not found.");

    const actIndex = data[index].actions.findIndex(a => a.id === actionId);
    if (actIndex === -1) throw new Error("Action not found.");

    const current = data[index].actions[actIndex];
    const toggled = { ...current, completed: !current.completed };
    const actions = [...data[index].actions];
    actions[actIndex] = toggled;
    data[index] = { ...data[index], actions, updated_at: this.now() };
    this.save(userId, data);
    return toggled;
  }

  async completeGoal(userId: string, id: string): Promise<Goal> {
    return this.updateGoal(userId, id, { status: "completed" });
  }

  async deleteGoal(userId: string, id: string): Promise<void> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local goals data is corrupted.");
    this.save(userId, data.filter(g => g.id !== id));
  }

  getStage(goal: Goal): number {
    if (goal.actions.length > 0) return 4;
    if (goal.plan) return 3;
    if (goal.deadline) return 2;
    return 1;
  }
}

export const goalsRepository = new GoalsRepository();
