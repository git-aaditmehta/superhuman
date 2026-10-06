/**
 * Tasks repository — local-first storage for to-do items.
 * Tasks are finite actions, separate from habits (which are repeating behaviors).
 */

import { BaseRepository, type BaseEntity, type VersionedEnvelope } from "./baseRepository";

export interface Task extends BaseEntity {
  text: string;
  done: boolean;
  date: string;          // YYYY-MM-DD date association
  completed_at: string | null;
}

export interface CreateTaskInput {
  text: string;
  date?: string;         // Defaults to today
}

export class TasksRepository extends BaseRepository<Task, Task[]> {
  protected storageKeyPrefix = "tasks";
  protected currentVersion = 1;

  protected getDefaultCollection(): Task[] { return []; }

  protected migrateFromLegacy(raw: unknown[]): Task[] {
    // Migrate from old { id, text, done } format
    return raw.map(item => this.sanitize(item)).filter((t): t is Task => t !== null);
  }

  protected validateAndMigrate(envelope: VersionedEnvelope<unknown>): Task[] {
    const items = Array.isArray(envelope.data) ? envelope.data : [];
    return items.map(item => this.sanitize(item)).filter((t): t is Task => t !== null);
  }

  private sanitize(item: unknown): Task | null {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" && c.id.trim() ? c.id.trim() : "";
    const text = typeof c.text === "string" ? c.text : "";
    if (!id || !text) return null;
    const now = this.now();
    const today = new Date().toISOString().split("T")[0];
    return {
      id, text,
      done: c.done === true,
      date: typeof c.date === "string" ? c.date : today,
      completed_at: typeof c.completed_at === "string" ? c.completed_at : (c.done === true ? now : null),
      created_at: typeof c.created_at === "string" ? c.created_at : now,
      updated_at: typeof c.updated_at === "string" ? c.updated_at : now,
    };
  }

  async getTasks(userId: string): Promise<Task[]> {
    const { data } = this.loadRaw(userId);
    return [...data].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return b.created_at.localeCompare(a.created_at);
    });
  }

  async getTasksForDate(userId: string, date: string): Promise<Task[]> {
    const tasks = await this.getTasks(userId);
    return tasks.filter(t => t.date === date);
  }

  async getTodayTasks(userId: string): Promise<Task[]> {
    const today = new Date().toISOString().split("T")[0];
    return this.getTasksForDate(userId, today);
  }

  async createTask(userId: string, input: CreateTaskInput): Promise<Task> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local tasks data is corrupted.");

    const now = this.now();
    const task: Task = {
      id: this.newId(),
      text: input.text.trim(),
      done: false,
      date: input.date ?? new Date().toISOString().split("T")[0],
      completed_at: null,
      created_at: now,
      updated_at: now,
    };
    this.save(userId, [task, ...data]);
    return task;
  }

  async toggleTask(userId: string, id: string): Promise<Task> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local tasks data is corrupted.");

    const index = data.findIndex(t => t.id === id);
    if (index === -1) throw new Error("Task not found.");

    const now = this.now();
    const task = data[index];
    data[index] = {
      ...task,
      done: !task.done,
      completed_at: !task.done ? now : null,
      updated_at: now,
    };
    this.save(userId, data);
    return data[index];
  }

  async deleteTask(userId: string, id: string): Promise<void> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local tasks data is corrupted.");
    this.save(userId, data.filter(t => t.id !== id));
  }

  async updateText(userId: string, id: string, text: string): Promise<Task> {
    const { data, isCorrupted } = this.loadRaw(userId);
    if (isCorrupted) throw new Error("Local tasks data is corrupted.");
    const index = data.findIndex(t => t.id === id);
    if (index === -1) throw new Error("Task not found.");
    data[index] = { ...data[index], text: text.trim(), updated_at: this.now() };
    this.save(userId, data);
    return data[index];
  }
}

export const tasksRepository = new TasksRepository();
