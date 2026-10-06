/**
 * Preferences repository — local-first user preferences and settings.
 * Theme, onboarding state, and user-controlled configuration.
 */

import { defaultStorageAdapter, type StorageAdapter } from "./localStorageAdapter";

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  onboarding_completed: boolean;
  onboarding_identity_answer: string;
  notification_permission: "granted" | "denied" | "default" | "unsupported";
  reduced_motion: boolean;
  version: number;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  onboarding_completed: false,
  onboarding_identity_answer: "",
  notification_permission: "default",
  reduced_motion: false,
  version: 1,
};

class PreferencesRepository {
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter = defaultStorageAdapter) {
    this.adapter = adapter;
  }

  private getKey(userId: string): string {
    const cleanId = typeof userId === "string" ? userId.trim() : "";
    if (!cleanId) throw new Error("User ID required.");
    return `superhuman:user:${cleanId}:preferences`;
  }

  get(userId: string): UserPreferences {
    try {
      const raw = this.adapter.getItem(this.getKey(userId));
      if (!raw) return { ...DEFAULT_PREFERENCES };
      const parsed = JSON.parse(raw) as Partial<UserPreferences>;
      return { ...DEFAULT_PREFERENCES, ...parsed };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  update(userId: string, partial: Partial<UserPreferences>): UserPreferences {
    const current = this.get(userId);
    const updated = { ...current, ...partial };
    this.adapter.setItem(this.getKey(userId), JSON.stringify(updated));
    return updated;
  }

  completeOnboarding(userId: string, identityAnswer: string): UserPreferences {
    return this.update(userId, {
      onboarding_completed: true,
      onboarding_identity_answer: identityAnswer,
    });
  }

  setOnboardingCompleted(userId: string, completed: boolean): UserPreferences {
    return this.update(userId, { onboarding_completed: completed });
  }

  setTheme(userId: string, theme: "light" | "dark" | "system"): UserPreferences {
    return this.update(userId, { theme });
  }

  getEffectiveTheme(userId: string): "light" | "dark" {
    const prefs = this.get(userId);
    if (prefs.theme === "system") {
      if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }
      return "light";
    }
    return prefs.theme;
  }
}

export const preferencesRepository = new PreferencesRepository();
