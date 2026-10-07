/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { notesRepository, type Note } from "./storage/notesRepository";
import { goalsRepository, type Goal } from "./storage/goalsRepository";
import { habitsRepository, type Habit } from "./storage/habitsRepository";
import { tasksRepository, type Task } from "./storage/tasksRepository";
import { historyRepository, type HistoryEvent } from "./storage/historyRepository";
import { preferencesRepository } from "./storage/preferencesRepository";
import { savedItemsRepository, type SavedItem } from "./storage/savedItemsRepository";
import { getDailyQuote, getWeeklyQuote } from "./data/quotes";
import "./style.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:8787" : "")).replace(/\/$/, "");
type User = { id: string; email: string; role: "user" | "admin" };
type Tone = "blue" | "lilac" | "mint" | "peach" | "butter";
type Screen = "today" | "habits" | "goals" | "notes" | "calendar" | "summaries" | "praise" | "save" | "settings" | "admin";

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? `Request failed (${response.status})`); }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const dateLabel = (date = new Date()) => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(date);
const timeLabel = (value: string) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }).format(new Date(value));
const todayStr = () => new Date().toISOString().split("T")[0];

/* ═══════════════════════════════════════════
   APP ROOT
   ═══════════════════════════════════════════ */
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [screen, setScreen] = useState<Screen>("today");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setThemeState] = useState<"light" | "dark" | "system">("system");
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(true);

  const applyTheme = useCallback((t: "light" | "dark" | "system") => {
    setThemeState(t);
    const effective = t === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : t;
    document.documentElement.setAttribute("data-theme", effective);
  }, []);

  const loadUser = useCallback(async () => {
    try {
      const result = await api<{ user: User }>("/api/auth/me");
      setUser(result.user);
      const prefs = preferencesRepository.get(result.user.id);
      applyTheme(prefs.theme);
      setOnboardingCompleted(Boolean(prefs.onboarding_completed));
      setScreen("today");
    } catch { setUser(null); }
    finally { setChecking(false); }
  }, [applyTheme]);

  useEffect(() => { void loadUser(); }, [loadUser]);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (theme === "system") applyTheme("system"); };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme, applyTheme]);

  async function authenticate(mode: "login" | "register", email: string, password: string) {
    setBusy(true); setNotice("");
    try {
      const result = await api<{ user: User }>(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });
      setUser(result.user);
      const prefs = preferencesRepository.get(result.user.id);
      applyTheme(prefs.theme);
      setOnboardingCompleted(Boolean(prefs.onboarding_completed));
      setScreen("today");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try { await api("/api/auth/logout", { method: "POST" }); setUser(null); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not sign out."); }
    finally { setBusy(false); }
  }

  function cycleTheme() {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    applyTheme(next);
    if (user) preferencesRepository.setTheme(user.id, next);
  }

  if (checking) return <div className="boot"><span className="brand-mark">s</span><span>Making space for you…</span></div>;
  if (!user) return <AuthScreen onSubmit={authenticate} busy={busy} notice={notice} />;

  if (!onboardingCompleted) {
    return (
      <OnboardingFlow
        user={user}
        onComplete={() => {
          setOnboardingCompleted(true);
          setScreen("today");
        }}
      />
    );
  }

  const NAV_ITEMS: { id: Screen; icon: string; label: string }[] = [
    { id: "today", icon: "◷", label: "Today" },
    { id: "habits", icon: "⟳", label: "Habits" },
    { id: "goals", icon: "◎", label: "Goals" },
    { id: "notes", icon: "▤", label: "Notes" },
    { id: "calendar", icon: "▦", label: "History" },
    { id: "summaries", icon: "☰", label: "Summaries" },
    { id: "praise", icon: "★", label: "Praise" },
    { id: "save", icon: "🔖", label: "Save" },
    { id: "settings", icon: "⚙", label: "Settings" },
  ];

  const heading: Record<Screen, string> = {
    today: "Today", notes: "Notes", goals: "Goals", habits: "Habits",
    calendar: "Life History", summaries: "Summaries & Review", praise: "Praise & Wins",
    save: "Saved Library", settings: "Settings", admin: "Admin",
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={e => { e.preventDefault(); setScreen("today"); }}>
          <span className="brand-mark">s</span><span>superhuman</span>
        </a>
        <div className="side-date">{dateLabel()}</div>
        <div className="side-label">Your Space</div>
        <nav className="primary-nav">
          {NAV_ITEMS.map(item => (
            <button key={item.id} className={`nav-item${screen === item.id ? " active" : ""}`} onClick={() => setScreen(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        {user.role === "admin" && (
          <>
            <div className="side-label">Tools</div>
            <nav className="primary-nav">
              <button className={`nav-item${screen === "admin" ? " active" : ""}`} onClick={() => setScreen("admin")}>
                <span className="nav-icon">⌘</span><span>Admin</span>
              </button>
            </nav>
          </>
        )}
        <div className="sidebar-quote">
          <span className="sidebar-quote-mark">"</span>
          <p>{getDailyQuote().text}</p>
          <span className="sidebar-quote-foot">YOUR REMINDER</span>
        </div>
        <div className="sidebar-profile">
          <span className="avatar">{user.email[0]?.toUpperCase()}</span>
          <span className="profile-copy">
            <strong>{user.email}</strong>
            <small>{user.role === "admin" ? "Administrator" : "Personal space"}</small>
          </span>
          <span className="profile-actions">
            <button className="icon-btn" onClick={cycleTheme} title={`Theme: ${theme}`}>
              {theme === "dark" ? "☽" : theme === "light" ? "☀" : "◐"}
            </button>
            <button className="icon-btn" onClick={() => void logout()} title="Sign out">↗</button>
          </span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <div className="breadcrumb">Your space <span>/</span> <strong>{heading[screen]}</strong></div>
          </div>
          <div className="topbar-right">
            <div className="save-indicator"><span className="save-dot" /> Private workspace</div>
            <button className="theme-toggle" onClick={cycleTheme} title={`Theme: ${theme}`}>
              {theme === "dark" ? "☽" : theme === "light" ? "☀" : "◐"}
            </button>
            <button className="topbar-logout" onClick={() => void logout()}>Sign out</button>
          </div>
        </header>

        <div className="page-container">
          {screen === "today" && <TodayPage user={user} setNotice={setNotice} navigate={setScreen} />}
          {screen === "habits" && <HabitsPage user={user} setNotice={setNotice} />}
          {screen === "goals" && <GoalsPage user={user} setNotice={setNotice} />}
          {screen === "notes" && <NotesPage user={user} setNotice={setNotice} />}
          {screen === "calendar" && <CalendarPage user={user} setNotice={setNotice} />}
          {screen === "summaries" && <SummariesPage user={user} setNotice={setNotice} />}
          {screen === "praise" && <PraisePage user={user} />}
          {screen === "save" && <SavedItemsPage user={user} setNotice={setNotice} />}
          {screen === "settings" && <SettingsPage user={user} theme={theme} onThemeChange={(t) => { applyTheme(t); preferencesRepository.setTheme(user.id, t); }} setNotice={setNotice} />}
          {screen === "admin" && user.role === "admin" && <AdminPanel setNotice={setNotice} />}
        </div>

        {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      </main>
    </div>
  );
}


/* ═══════════════════════════════════════════
   AUTH SCREEN
   ═══════════════════════════════════════════ */
function AuthScreen({ onSubmit, busy, notice }: { onSubmit: (mode: "login" | "register", email: string, password: string) => Promise<void>; busy: boolean; notice: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  function submit(e: FormEvent) { e.preventDefault(); void onSubmit(mode, email, password); }

  return (
    <div className="auth-shell">
      <section className="auth-art">
        <div className="art-top"><span className="brand-mark">s</span><span>SUPERHUMAN</span></div>
        <div className="art-composition">
          <div className="art-orbit" />
          <div className="art-card art-card-blue">
            <span className="art-eyebrow">AN IDEA TO KEEP</span>
            <h3>Make room<br/>for good things.</h3>
          </div>
          <div className="art-card art-card-yellow">
            <span className="art-eyebrow">TODAY</span>
            <div className="art-task"><span className="art-task-check done">✓</span>Start with one thing</div>
            <div className="art-task"><span className="art-task-check" />Keep a little space</div>
          </div>
          <span className="art-accent">✳</span>
        </div>
        <div className="art-caption">
          <h2>A place to gather<br/>your thoughts.</h2>
          <p>Make sense of today. Make progress on what matters.</p>
        </div>
        <span className="art-foot">YOUR OWN PACE · YOUR OWN SPACE</span>
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand"><span className="brand-mark">s</span> superhuman</div>
        <div className="auth-card">
          <div className="eyebrow">A MORE THOUGHTFUL WORKSPACE</div>
          <h1>{mode === "login" ? "Welcome back." : "Begin with a thought."}</h1>
          <p className="auth-intro">{mode === "login" ? "Your space is right where you left it." : "Create your personal space and make it your own."}</p>
          <div className="auth-switch">
            <button className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")}>Sign in</button>
            <button className={mode === "register" ? "selected" : ""} onClick={() => setMode("register")}>Create account</button>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
            <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === "register" ? "At least 12 characters" : "Your password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 12 : undefined} required /></label>
            {notice && <div className="form-error" role="alert">{notice}</div>}
            <button className="btn-primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}<span className="btn-icon">→</span></button>
          </form>
          <div className="privacy-line"><span className="lock-icon">◈</span> Your data stays on your device. Always.</div>
        </div>
        <footer className="auth-footer">A quieter place to think · Superhuman</footer>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ONBOARDING
   ═══════════════════════════════════════════ */
function OnboardingFlow({ user, onComplete }: { user: User; onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [identity, setIdentity] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");
  const [goalPlan, setGoalPlan] = useState("");
  const [habitName, setHabitName] = useState("");
  const [habitFloor, setHabitFloor] = useState("");
  const [habitCue, setHabitCue] = useState("");
  const [habitAnchor, setHabitAnchor] = useState("");

  async function finishOnboarding() {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Create goal if provided
      if (goalTitle.trim()) {
        const goal = await goalsRepository.createGoal(user.id, {
          title: goalTitle.trim(),
          deadline: goalDeadline,
          plan: goalPlan.trim(),
        });
        // Create habit linked to goal if provided
        if (habitName.trim()) {
          await habitsRepository.createHabit(user.id, {
            name: habitName.trim(),
            floor_action: habitFloor.trim(),
            cue: habitCue.trim(),
            anchor: habitAnchor.trim(),
            goal_id: goal.id,
          });
        }
        // Record in history
        await historyRepository.addEvent(user.id, {
          type: "goal_created",
          title: `Goal created: ${goalTitle.trim()}`,
          source_id: goal.id,
          source_type: "goal",
        });
      } else if (habitName.trim()) {
        await habitsRepository.createHabit(user.id, {
          name: habitName.trim(),
          floor_action: habitFloor.trim(),
          cue: habitCue.trim(),
          anchor: habitAnchor.trim(),
        });
      }
      preferencesRepository.completeOnboarding(user.id, identity.trim());
      onComplete();
    } catch (err) {
      console.error("Onboarding error:", err);
      alert(err instanceof Error ? err.message : "Could not complete onboarding. Please try again.");
      setSubmitting(false);
    }
  }

  const steps = [
    // Step 0: Identity
    <div key="identity" className="onboarding-card">
      <div className="eyebrow">LET'S START WITH YOU</div>
      <h2>What's one thing you want to be true about yourself in 90 days?</h2>
      <p>Think about who you want to become, not just what you want to do. This is about identity.</p>
      <div className="onboarding-form">
        <label>Your 90-day vision
          <textarea value={identity} onChange={e => setIdentity(e.target.value)} placeholder="I want to be someone who..." rows={3} maxLength={500} autoFocus />
        </label>
      </div>
      <div className="onboarding-actions">
        <span className="onboarding-skip" />
        <button className="btn-primary" onClick={() => setStep(1)}>Continue <span className="btn-icon">→</span></button>
      </div>
    </div>,

    // Step 1: Goal
    <div key="goal" className="onboarding-card">
      <div className="eyebrow">L1 — NAME YOUR GOAL</div>
      <h2>Give what matters a little more shape.</h2>
      <p>Start with the outcome you want. We'll add a deadline and plan next.</p>
      <div className="onboarding-form">
        <label>What do you want to achieve?
          <input value={goalTitle} onChange={e => setGoalTitle(e.target.value)} placeholder="A clear, meaningful outcome" maxLength={180} autoFocus />
        </label>
        <label>Deadline <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>L2 · Optional</span>
          <input type="date" value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)} />
        </label>
        <label>Plan / strategy <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>L3 · Optional</span>
          <textarea value={goalPlan} onChange={e => setGoalPlan(e.target.value)} placeholder="What approach could get you there?" rows={2} />
        </label>
      </div>
      <div className="onboarding-actions">
        <button className="btn-text" onClick={() => setStep(0)}>← Back</button>
        <button className="btn-primary" onClick={() => setStep(2)}>Continue <span className="btn-icon">→</span></button>
      </div>
    </div>,

    // Step 2: Habit
    <div key="habit" className="onboarding-card">
      <div className="eyebrow">BUILD YOUR FIRST HABIT</div>
      <h2>What's the smallest action that moves you forward?</h2>
      <p>Define the minimum version — what you'd do on your worst day. Attach it to a cue so it becomes automatic.</p>
      <div className="onboarding-form">
        <label>The habit <span className="form-hint">What you'll do</span>
          <input value={habitName} onChange={e => setHabitName(e.target.value)} placeholder="e.g., Read for 10 minutes" maxLength={120} autoFocus />
        </label>
        <label>Floor action <span className="form-hint">Bad-day minimum</span>
          <input value={habitFloor} onChange={e => setHabitFloor(e.target.value)} placeholder="e.g., Read one page" maxLength={120} />
        </label>
        <label>Cue / context <span className="form-hint">When or where</span>
          <input value={habitCue} onChange={e => setHabitCue(e.target.value)} placeholder="e.g., After morning coffee" maxLength={120} />
        </label>
        <label>Anchor for habit stacking <span className="form-hint">Optional</span>
          <input value={habitAnchor} onChange={e => setHabitAnchor(e.target.value)} placeholder="e.g., After I brush my teeth" maxLength={120} />
        </label>
        {habitAnchor && habitName && (
          <div style={{ padding: "12px", background: "var(--accent-primary-soft)", borderRadius: "var(--radius-sm)", fontSize: "12px", color: "var(--accent-primary)", fontStyle: "italic" }}>
            "After {habitAnchor}, I will {habitName.toLowerCase()}"
          </div>
        )}
      </div>
      <div className="onboarding-actions">
        <button className="btn-text" disabled={submitting} onClick={() => setStep(1)}>← Back</button>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn-secondary" disabled={submitting} onClick={() => void finishOnboarding()}>
            Skip habit
          </button>
          <button className="btn-primary" disabled={submitting} onClick={() => void finishOnboarding()}>
            {submitting ? "Starting your journey…" : <>Start my journey <span className="btn-icon">→</span></>}
          </button>
        </div>
      </div>
    </div>,
  ];

  return (
    <div className="onboarding-shell">
      <div className="onboarding-brand"><span className="brand-mark">s</span> superhuman</div>
      <div className="onboarding-progress">
        {[0, 1, 2].map(i => (
          <div key={i} className={`onboarding-dot${i === step ? " active" : i < step ? " done" : ""}`} />
        ))}
      </div>
      {steps[step]}
    </div>
  );
}

/* ═══════════════════════════════════════════
   TODAY / HOME DASHBOARD
   ═══════════════════════════════════════════ */
function TodayPage({ user, setNotice, navigate }: { user: User; setNotice: (m: string) => void; navigate: (s: Screen) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [taskDraft, setTaskDraft] = useState("");
  const quote = useMemo(() => getDailyQuote(), []);

  const refresh = useCallback(async () => {
    const [t, h, g] = await Promise.all([
      tasksRepository.getTodayTasks(user.id),
      habitsRepository.getHabits(user.id),
      goalsRepository.getGoals(user.id),
    ]);
    setTasks(t); setHabits(h); setGoals(g);
  }, [user.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function addTask(e: FormEvent) {
    e.preventDefault();
    if (!taskDraft.trim()) return;
    await tasksRepository.createTask(user.id, { text: taskDraft.trim() });
    setTaskDraft("");
    await refresh();
  }

  async function toggleTask(id: string) {
    await tasksRepository.toggleTask(user.id, id);
    await refresh();
  }

  async function deleteTask(id: string) {
    await tasksRepository.deleteTask(user.id, id);
    await refresh();
  }

  async function toggleHabitCheckin(habit: Habit) {
    const checked = habitsRepository.isCheckedToday(habit);
    if (checked) {
      await habitsRepository.uncheckIn(user.id, habit.id, todayStr());
    } else {
      const result = await habitsRepository.checkIn(user.id, habit.id);
      if (result.newMilestones.length > 0) {
        for (const m of result.newMilestones) {
          await historyRepository.addEvent(user.id, {
            type: "habit_milestone",
            title: `${m.label}: ${habit.name}`,
            description: `${m.days}-day streak achieved!`,
            source_id: habit.id,
            source_type: "habit",
            metadata: { days: m.days },
          });
        }
        setNotice(`🎉 ${result.newMilestones.map(m => m.label).join(", ")}!`);
      }
      // Record check-in in history
      await historyRepository.addEvent(user.id, {
        type: "check_in",
        title: `Checked in: ${habit.name}`,
        source_id: habit.id,
        source_type: "habit",
      });
    }
    await refresh();
  }

  const completedTasks = tasks.filter(t => t.done).length;
  const checkedHabits = habits.filter(h => habitsRepository.isCheckedToday(h)).length;
  const totalToday = tasks.length + habits.length;
  const doneToday = completedTasks + checkedHabits;
  const progress = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;
  const circumference = 2 * Math.PI * 42;

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <div className="eyebrow">A MOMENT FOR YOU</div>
          <h1>Today<span className="heading-dot">.</span></h1>
          <p>{dateLabel()} · One step at a time.</p>
        </div>
        <div className="page-header-stat">
          <strong>{doneToday}<span style={{ fontSize: "14px", color: "var(--text-tertiary)" }}> / {totalToday}</span></strong>
          <small>COMPLETED</small>
        </div>
      </div>

      <div className="motivation-banner">
        <span className="motivation-quote-mark">"</span>
        <div className="motivation-text">
          <p>{quote.text}</p>
          {quote.author && <span className="quote-author">— {quote.author}</span>}
          <small>YOUR DAILY REMINDER</small>
        </div>
      </div>

      <div className="today-layout" style={{ marginTop: "var(--space-lg)" }}>
        <div className="today-main">
          <div className="today-grid">
            {/* Habit Quick Check-ins */}
            <div className="habit-checkin-card">
              <div className="card-title">
                <h3>Habits</h3>
                <span className="card-count">{checkedHabits} / {habits.length}</span>
              </div>
              {habits.length > 0 ? (
                <div className="habit-quick-list">
                  {habits.map(habit => {
                    const checked = habitsRepository.isCheckedToday(habit);
                    const stats = habitsRepository.computeStats(habit);
                    return (
                      <div key={habit.id} className="habit-quick-item" onClick={() => void toggleHabitCheckin(habit)}>
                        <span className={`habit-check${checked ? " checked" : ""}`}>{checked ? "✓" : ""}</span>
                        <span className={`habit-quick-name${checked ? " done" : ""}`}>{habit.name}</span>
                        {stats.currentStreak > 0 && <span className="habit-quick-streak">{stats.currentStreak}d</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: "var(--space-lg)" }}>
                  <p>No habits yet.</p>
                  <button className="btn-text" onClick={() => navigate("habits")}>Create a habit →</button>
                </div>
              )}
            </div>

            {/* Today's Tasks */}
            <div className="today-tasks-card">
              <div className="card-title">
                <h3>Tasks</h3>
                <span className="card-count">{completedTasks} / {tasks.length}</span>
              </div>
              <form className="task-add-form" onSubmit={addTask}>
                <span className="add-icon">＋</span>
                <input value={taskDraft} onChange={e => setTaskDraft(e.target.value)} placeholder="What would feel good to finish?" />
              </form>
              <div className="task-list">
                {tasks.map(task => (
                  <div key={task.id} className={`task-item${task.done ? " done" : ""}`}>
                    <span className="task-check" onClick={() => void toggleTask(task.id)}>{task.done ? "✓" : ""}</span>
                    <span className="task-text" onClick={() => void toggleTask(task.id)}>{task.text}</span>
                    <button className="task-delete" onClick={() => void deleteTask(task.id)}>×</button>
                  </div>
                ))}
                {tasks.length === 0 && <p style={{ fontSize: "11px", color: "var(--text-tertiary)", padding: "var(--space-md) 0" }}>A blank list is a perfectly good plan.</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Today Sidebar */}
        <div className="today-rail">
          <div className="progress-card">
            <h4>Today's Progress</h4>
            <div className="progress-ring-container">
              <div className="progress-ring">
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle className="ring-bg" cx="50" cy="50" r="42" />
                  <circle className="ring-fill" cx="50" cy="50" r="42"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - (progress / 100) * circumference} />
                </svg>
                <div className="progress-ring-label">
                  <strong>{progress}%</strong>
                  <small>DONE</small>
                </div>
              </div>
            </div>
            <div className="progress-stats">
              <div className="progress-stat"><span>Habits done</span><strong>{checkedHabits}/{habits.length}</strong></div>
              <div className="progress-stat"><span>Tasks done</span><strong>{completedTasks}/{tasks.length}</strong></div>
            </div>
          </div>

          <div className="goals-preview-card">
            <h4>Goals in Motion</h4>
            {goals.filter(g => g.status === "active").slice(0, 4).map(goal => (
              <div key={goal.id} className="goal-preview-item">
                <span className="goal-level-badge">L{goalsRepository.getStage(goal)}</span>
                <div className="goal-preview-text">
                  <strong>{goal.title}</strong>
                  <small>{goal.deadline ? `Due ${new Date(`${goal.deadline}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Keep moving"}</small>
                </div>
              </div>
            ))}
            {goals.filter(g => g.status === "active").length === 0 && (
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Your goals will appear here.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   HABITS PAGE
   ═══════════════════════════════════════════ */
function HabitsPage({ user, setNotice }: { user: User; setNotice: (m: string) => void }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [floor, setFloor] = useState("");
  const [cue, setCue] = useState("");
  const [anchor, setAnchor] = useState("");

  const refresh = useCallback(async () => { setHabits(await habitsRepository.getHabits(user.id)); }, [user.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function createHabit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await habitsRepository.createHabit(user.id, { name: name.trim(), floor_action: floor.trim(), cue: cue.trim(), anchor: anchor.trim() });
    setName(""); setFloor(""); setCue(""); setAnchor(""); setShowForm(false);
    await refresh();
    setNotice("Habit created! Let's build it one day at a time.");
  }

  async function checkIn(habit: Habit) {
    const checked = habitsRepository.isCheckedToday(habit);
    if (checked) {
      await habitsRepository.uncheckIn(user.id, habit.id, todayStr());
    } else {
      const result = await habitsRepository.checkIn(user.id, habit.id);
      if (result.newMilestones.length > 0) {
        for (const m of result.newMilestones) {
          await historyRepository.addEvent(user.id, {
            type: "habit_milestone", title: `${m.label}: ${habit.name}`,
            description: `${m.days}-day streak!`, source_id: habit.id, source_type: "habit",
          });
        }
        setNotice(`🎉 ${result.newMilestones.map(m => m.label).join(", ")}!`);
      }
    }
    await refresh();
  }

  async function applyGrace(habit: Habit) {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split("T")[0];
      await habitsRepository.useGraceDay(user.id, habit.id, yStr);
      await historyRepository.addEvent(user.id, {
        type: "habit_milestone",
        title: `Grace Day: ${habit.name}`,
        description: `Preserved streak without penalty for ${yStr}`,
        source_id: habit.id,
        source_type: "habit",
      });
      await refresh();
      setNotice("🛡️ Grace day applied! Streak protected without guilt.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not apply grace day.");
    }
  }

  async function handleFreshStart(habit: Habit) {
    if (!window.confirm(`Start fresh on "${habit.name}"? This resets your current cycle cleanly while preserving all your past check-in records.`)) return;
    try {
      await habitsRepository.freshStart(user.id, habit.id);
      await historyRepository.addEvent(user.id, {
        type: "fresh_start",
        title: `Fresh Start: ${habit.name}`,
        description: "Began a new habit cycle.",
        source_id: habit.id,
        source_type: "habit",
      });
      await refresh();
      setNotice("🌱 Fresh start initiated! Begin today with clean momentum.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not reset habit.");
    }
  }

  async function deleteHabit(habit: Habit) {
    if (!window.confirm(`Archive habit "${habit.name}"?`)) return;
    await habitsRepository.archiveHabit(user.id, habit.id);
    await refresh();
    setNotice("Habit archived.");
  }

  function getMiniCalendarDays(habit: Habit): { date: string; checked: boolean; isToday: boolean }[] {
    const dates = habitsRepository.getCheckedDates(habit);
    const today = new Date();
    const days: { date: string; checked: boolean; isToday: boolean }[] = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const str = d.toISOString().split("T")[0];
      days.push({ date: str, checked: dates.has(str), isToday: i === 0 });
    }
    return days;
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <div className="eyebrow">BECOME WHO YOU INTEND TO BE</div>
          <h1>Habits<span className="heading-dot">.</span></h1>
          <p>Small, repeatable behaviors that compound over time.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <span className="btn-icon">＋</span> New habit
        </button>
      </div>

      {showForm && (
        <form className="habit-form-card" onSubmit={createHabit}>
          <h3>Build a New Habit</h3>
          <div className="form-group">
            <label>The habit <span className="form-hint">What you'll do</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Meditate for 5 minutes" required maxLength={120} autoFocus />
          </div>
          <div className="form-group">
            <label>Floor action <span className="form-hint">Bad-day minimum</span></label>
            <input value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g., Close eyes and breathe for 1 minute" maxLength={120} />
          </div>
          <div className="form-group">
            <label>Cue / context <span className="form-hint">When or where</span></label>
            <input value={cue} onChange={e => setCue(e.target.value)} placeholder="e.g., After morning coffee" maxLength={120} />
          </div>
          <div className="form-group">
            <label>Anchor <span className="form-hint">For habit stacking — optional</span></label>
            <input value={anchor} onChange={e => setAnchor(e.target.value)} placeholder="e.g., After I brush my teeth" maxLength={120} />
          </div>
          {anchor && name && (
            <div style={{ padding: "12px", background: "var(--accent-primary-soft)", borderRadius: "var(--radius-sm)", fontSize: "12px", color: "var(--accent-primary)", fontStyle: "italic", marginBottom: "var(--space-md)" }}>
              "After {anchor}, I will {name.toLowerCase()}"
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" disabled={!name.trim()}>Create habit <span className="btn-icon">↑</span></button>
          </div>
        </form>
      )}

      {habits.length > 0 ? (
        <div className="habits-grid">
          {habits.map(habit => {
            const stats = habitsRepository.computeStats(habit);
            const checked = habitsRepository.isCheckedToday(habit);
            const calDays = getMiniCalendarDays(habit);
            const missedYesterday = habitsRepository.missedYesterday(habit);
            return (
              <div key={habit.id} className="habit-card">
                <div className="habit-card-header">
                  <h3>{habit.name}</h3>
                  <span className={`habit-stage-badge stage-${stats.stage}`}>{stats.stage.toUpperCase()}</span>
                </div>
                {habit.intention && <div className="habit-intention">"{habit.intention}"</div>}
                {habit.floor_action && <div className="habit-floor">↓ Floor: {habit.floor_action}</div>}

                <div className="habit-stats-row">
                  <div className="habit-stat">
                    <span className="habit-stat-value">{stats.currentStreak}</span>
                    <span className="habit-stat-label">CURRENT STREAK</span>
                  </div>
                  <div className="habit-stat">
                    <span className="habit-stat-value">{stats.longestStreak}</span>
                    <span className="habit-stat-label">LONGEST</span>
                  </div>
                  <div className="habit-stat">
                    <span className="habit-stat-value">{stats.totalCheckIns}</span>
                    <span className="habit-stat-label">TOTAL</span>
                  </div>
                  <div className="habit-stat">
                    <span className="habit-stat-value">{stats.completionRate}%</span>
                    <span className="habit-stat-label">RATE</span>
                  </div>
                </div>

                {habit.milestones.length > 0 && (
                  <div className="habit-milestone-chips">
                    {habit.milestones.map(m => (
                      <span key={m.id} className="milestone-chip">🏆 {m.label} ({m.days}d)</span>
                    ))}
                  </div>
                )}

                {missedYesterday && !stats.graceUsedThisMonth && (
                  <div style={{ padding: "8px 12px", background: "var(--accent-primary-soft)", borderRadius: "var(--radius-sm)", fontSize: "11px", color: "var(--accent-primary)", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                    <span>Missed yesterday? Keep streak intact</span>
                    <button className="btn-secondary btn-sm" onClick={() => void applyGrace(habit)}>Use Grace Pass</button>
                  </div>
                )}

                <div className="mini-calendar" style={{ marginTop: "12px" }}>
                  {calDays.map(d => (
                    <div key={d.date} className={`mini-cal-day${d.checked ? " checked" : ""}${d.isToday ? " today" : ""}`}>
                      {d.checked ? "✕" : d.date.split("-")[2]}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "8px", marginTop: "14px", alignItems: "center", flexWrap: "wrap" }}>
                  <button className={`habit-checkin-btn ${checked ? "checked" : "unchecked"}`} onClick={() => void checkIn(habit)}>
                    {checked ? "✓ Done today" : "Check in — mark today"}
                  </button>
                  {stats.graceUsedThisMonth ? (
                    <span className="grace-badge" title="Grace day already used this month">Grace used</span>
                  ) : (
                    <button className="btn-secondary btn-sm" onClick={() => void applyGrace(habit)} title="Use 1 free monthly pass to excuse a missed day">
                      Grace day
                    </button>
                  )}
                  <button className="btn-secondary btn-sm" onClick={() => void handleFreshStart(habit)} title="Restart habit cycle cleanly without guilt">
                    🌱 Fresh start
                  </button>
                  <button className="icon-btn-danger" onClick={() => void deleteHabit(habit)} title="Archive habit">×</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : !showForm && (
        <div className="empty-state">
          <div className="empty-state-icon">⟳</div>
          <h3>No habits yet.</h3>
          <p>Start with one small behavior. The rest will follow.</p>
          <button className="btn-text" onClick={() => setShowForm(true)} style={{ marginTop: "var(--space-md)" }}>Create your first habit →</button>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   GOALS PAGE
   ═══════════════════════════════════════════ */
function GoalsPage({ user, setNotice }: { user: User; setNotice: (m: string) => void }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [deadline, setDeadline] = useState("");
  const [plan, setPlan] = useState("");
  const [actionDrafts, setActionDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => { setGoals(await goalsRepository.getGoals(user.id)); }, [user.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function createGoal(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const goal = await goalsRepository.createGoal(user.id, { title: title.trim(), why: why.trim(), deadline, plan: plan.trim() });
    setTitle(""); setWhy(""); setDeadline(""); setPlan(""); setShowForm(false); setExpanded(goal.id);
    await refresh();
    await historyRepository.addEvent(user.id, { type: "goal_created", title: `Goal: ${goal.title}`, source_id: goal.id, source_type: "goal" });
  }

  async function addAction(goalId: string, e: FormEvent) {
    e.preventDefault();
    const text = actionDrafts[goalId]?.trim();
    if (!text) return;
    await goalsRepository.addAction(user.id, goalId, text);
    setActionDrafts(d => ({ ...d, [goalId]: "" }));
    await refresh();
  }

  async function completeGoal(goalId: string) {
    const goal = await goalsRepository.completeGoal(user.id, goalId);
    await historyRepository.addEvent(user.id, { type: "goal_completed", title: `Goal achieved: ${goal.title}`, source_id: goal.id, source_type: "goal" });
    await historyRepository.addEvent(user.id, { type: "big_win", title: `Completed goal: ${goal.title}`, source_id: goal.id, source_type: "goal" });
    setNotice(`🎉 Goal completed: ${goal.title}!`);
    await refresh();
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <div className="eyebrow">FROM INTENTION TO ACTION</div>
          <h1>Goals<span className="heading-dot">.</span></h1>
          <p>Give what matters a little more shape.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}><span className="btn-icon">＋</span> New goal</button>
      </div>

      <div className="goal-ladder-intro">
        <div className="ladder-icon">◎</div>
        <div>
          <strong>Build each goal one step at a time.</strong>
          <p>L1 Goal → L2 Deadline → L3 Plan → L4 Action. Your next level appears as you add detail.</p>
        </div>
        <div className="ladder-levels">{[1,2,3,4].map(l => <span key={l} className="ladder-level">L{l}</span>)}</div>
      </div>

      {showForm && (
        <form className="habit-form-card" onSubmit={createGoal} style={{ marginBottom: "var(--space-lg)" }}>
          <h3>Name Your Goal</h3>
          <div className="form-group"><label>What do you want to achieve? <span className="form-hint">L1</span></label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="A clear, meaningful outcome" required maxLength={180} autoFocus /></div>
          <div className="form-group"><label>Why does it matter? <span className="form-hint">Optional</span></label><textarea value={why} onChange={e => setWhy(e.target.value)} placeholder="The reason you'll come back to…" rows={2} /></div>
          <div className="form-group"><label>Deadline <span className="form-hint">L2 · Optional</span></label><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
          <div className="form-group"><label>Plan / strategy <span className="form-hint">L3 · Optional</span></label><textarea value={plan} onChange={e => setPlan(e.target.value)} placeholder="What approach could get you there?" rows={2} /></div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" disabled={!title.trim()}>Create goal <span className="btn-icon">↑</span></button>
          </div>
        </form>
      )}

      {goals.length > 0 ? (
        <div className="goals-list">
          {goals.map(goal => {
            const stage = goalsRepository.getStage(goal);
            const isExpanded = expanded === goal.id;
            return (
              <div key={goal.id} className={`goal-card${isExpanded ? " expanded" : ""}${goal.status === "completed" ? " completed" : ""}`}>
                <button className="goal-card-summary" onClick={() => setExpanded(isExpanded ? null : goal.id)}>
                  <span className="goal-stage-pill">L{stage}</span>
                  <div className="goal-info">
                    <strong>{goal.status === "completed" ? "✓ " : ""}{goal.title}</strong>
                    <small>{goal.deadline ? `Due ${new Date(`${goal.deadline}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : goal.why || "A goal taking shape"}</small>
                  </div>
                  <span className="goal-progress-label">{stage}/4</span>
                  <span className="goal-chevron">⌄</span>
                </button>
                <div className="goal-stage-track">{[1,2,3,4].map(l => <span key={l} className={`stage-dot${l <= stage ? " reached" : ""}`}><i />L{l}</span>)}</div>
                {isExpanded && (
                  <div className="goal-detail">
                    <div className="goal-detail-level reached"><span className="level-badge">L1</span><div className="level-content"><div className="level-caption">THE GOAL</div><div className="level-value">{goal.title}</div>{goal.why && <small style={{ color: "var(--text-tertiary)", fontSize: "11px" }}>{goal.why}</small>}</div></div>
                    <div className={`goal-detail-level${goal.deadline ? " reached" : ""}`}><span className="level-badge">L2</span><div className="level-content"><div className="level-caption">THE DEADLINE</div>{goal.deadline ? <div className="level-value">{new Date(`${goal.deadline}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</div> : <div className="level-placeholder">Add a deadline to bring it into focus.</div>}<input type="date" value={goal.deadline} onChange={e => { void goalsRepository.updateGoal(user.id, goal.id, { deadline: e.target.value }).then(() => refresh()); }} /></div></div>
                    <div className={`goal-detail-level${goal.plan ? " reached" : ""}`}><span className="level-badge">L3</span><div className="level-content"><div className="level-caption">THE PLAN</div>{goal.plan ? <div className="level-value">{goal.plan}</div> : <div className="level-placeholder">Add a plan to make your goal actionable.</div>}<textarea rows={2} placeholder="A few steps or a guiding approach…" value={goal.plan} onChange={e => { void goalsRepository.updateGoal(user.id, goal.id, { plan: e.target.value }).then(() => refresh()); }} /></div></div>
                    <div className={`goal-detail-level${goal.actions.length > 0 ? " reached" : ""}`}><span className="level-badge">L4</span><div className="level-content"><div className="level-caption">IN MOTION</div>{goal.actions.length > 0 ? <div className="goal-actions-list">{goal.actions.map(a => <div key={a.id} className="goal-action-item"><i /><span>{a.text}</span><time>{timeLabel(a.at)}</time></div>)}</div> : <div className="level-placeholder">Take your first action to unlock this level.</div>}<form className="action-add-form" onSubmit={e => addAction(goal.id, e)}><input placeholder="What action did you take?" value={actionDrafts[goal.id] ?? ""} onChange={e => setActionDrafts(d => ({ ...d, [goal.id]: e.target.value }))} /><button disabled={!actionDrafts[goal.id]?.trim()}>↑</button></form></div></div>
                    {goal.status === "active" && (
                      <div className="goal-card-actions">
                        <button className="btn-primary" onClick={() => void completeGoal(goal.id)}>✓ Mark goal complete</button>
                        <button className="btn-secondary" onClick={() => { void goalsRepository.deleteGoal(user.id, goal.id).then(() => refresh()); }}>Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !showForm && (
        <div className="empty-state">
          <div className="empty-state-icon">◎</div>
          <h3>Make space for a goal.</h3>
          <p>Give it a name. The deadline, strategy, and action levels can come next.</p>
          <button className="btn-text" onClick={() => setShowForm(true)} style={{ marginTop: "var(--space-md)" }}>Create your first goal →</button>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   NOTES PAGE
   ═══════════════════════════════════════════ */
function NotesPage({ user, setNotice }: { user: User; setNotice: (m: string) => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pinned">("all");
  const [composer, setComposer] = useState(false);
  const [activeNote, setActiveNote] = useState<Note | null>(null);

  const refresh = useCallback(async () => {
    try { setNotes(await notesRepository.getNotes(user.id)); } catch (e) { setNotice(e instanceof Error ? e.message : "Could not load notes."); }
    finally { setLoading(false); }
  }, [user.id, setNotice]);

  useEffect(() => { void refresh(); }, [refresh]);

  const shown = useMemo(() => notes.filter(n => filter === "all" || n.is_pinned === 1), [notes, filter]);
  const pinned = notes.filter(n => n.is_pinned === 1).length;

  const toneForNote = (_note: Note, index: number): Tone => {
    const tones: Tone[] = ["blue", "lilac", "mint", "peach", "butter"];
    return tones[index % tones.length];
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <div className="eyebrow">A HOME FOR YOUR THOUGHTS</div>
          <h1>Notes<span className="heading-dot">.</span></h1>
          <p>Capture what's on your mind. Every thought gets a date.</p>
        </div>
        <button className="btn-primary" onClick={() => setComposer(true)}><span className="btn-icon">＋</span> New note</button>
      </div>

      <div className="notes-toolbar">
        <h3>Your board <span>{notes.length}</span></h3>
        <div className="filter-tabs">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All {notes.length}</button>
          <button className={filter === "pinned" ? "active" : ""} onClick={() => setFilter("pinned")}>Pinned {pinned}</button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading your notes…</p></div>
      ) : (
        <div className="notes-grid">
          {shown.map((note, i) => (
            <div key={note.id} className={`note-card tone-${toneForNote(note, i)}`} onClick={() => setActiveNote(note)}>
              <div className="note-meta">
                <span>{new Date(note.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                {note.is_pinned === 1 && <span className="pinned-badge">PINNED</span>}
              </div>
              <h4>{note.title}</h4>
              <p className="note-preview">{note.content || "A thought, just as it is."}</p>
              <div className="note-card-foot">
                <span style={{ fontSize: "9px", color: "var(--text-tertiary)" }}>Open →</span>
                <div className="note-card-actions" onClick={e => e.stopPropagation()}>
                  <button onClick={() => void notesRepository.togglePin(user.id, note.id).then(() => refresh())} title={note.is_pinned ? "Unpin" : "Pin"}>{note.is_pinned ? "◆" : "◇"}</button>
                  <button onClick={() => { void notesRepository.deleteNote(user.id, note.id).then(() => { refresh(); setNotice("Note removed."); }); }} title="Delete">×</button>
                </div>
              </div>
            </div>
          ))}
          {filter === "all" && Array.from({ length: Math.max(1, 3 - shown.length) }).map((_, i) => (
            <button key={`empty-${i}`} className="empty-sticker" onClick={() => setComposer(true)}>
              <span className="sticker-plus">＋</span>
              <span className="sticker-label">A thought goes here</span>
              <span className="sticker-hint">TAP TO WRITE</span>
            </button>
          ))}
        </div>
      )}

      {composer && <NoteComposer onClose={() => setComposer(false)} onSave={async (title, content, _tone) => {
        await notesRepository.createNote(user.id, { title: title || "Untitled thought", content });
        setComposer(false);
        await refresh();
        setNotice("Note saved to your board.");
      }} />}

      {activeNote && <NoteDetail note={activeNote} user={user} onClose={() => setActiveNote(null)} onUpdate={async () => { await refresh(); setActiveNote(null); }} setNotice={setNotice} />}
    </>
  );
}

function NoteComposer({ onClose, onSave }: { onClose: () => void; onSave: (title: string, content: string, tone: Tone) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tone, setTone] = useState<Tone>("blue");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    await onSave(title.trim(), content.trim(), tone);
    setSaving(false);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dialog-panel note-compose-dialog tone-${tone}`} style={{ background: `var(--tone-${tone})` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-md)" }}>
          <span style={{ fontSize: "9px", letterSpacing: "1.2px", fontWeight: 700, color: "var(--text-tertiary)" }}>A NEW THOUGHT</span>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: "18px" }}>×</button>
        </div>
        <div className="tone-swatches">
          {(["blue", "lilac", "mint", "peach", "butter"] as Tone[]).map(t => (
            <button key={t} type="button" className={`tone-swatch swatch-${t}${tone === t ? " selected" : ""}`} onClick={() => setTone(t)} />
          ))}
        </div>
        <form onSubmit={submit}>
          <input className="compose-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="A title, if you like…" maxLength={160} autoFocus />
          <textarea className="compose-content" value={content} onChange={e => setContent(e.target.value)} placeholder="What's on your mind? Start anywhere." rows={8} maxLength={50000} />
          <div className="compose-footer">
            <span>Every note gets a timestamp.</span>
            <button className="btn-primary" disabled={saving || (!title.trim() && !content.trim())}>{saving ? "Saving…" : "Save note"} <span className="btn-icon">↑</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NoteDetail({ note, user, onClose, onUpdate, setNotice }: { note: Note; user: User; onClose: () => void; onUpdate: () => Promise<void>; setNotice: (m: string) => void }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function addEntry(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await notesRepository.updateNote(user.id, note.id, { content: draft.trim() });
      setDraft("");
      await onUpdate();
      setNotice("Entry added.");
    } catch (err) { setNotice(err instanceof Error ? err.message : "Could not save."); }
    finally { setSaving(false); }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="note-detail-panel tone-blue" style={{ background: "var(--tone-blue)" }}>
        <div className="note-detail-header">
          <div>
            <span className="note-detail-kicker">YOUR NOTE</span>
            <h2>{note.title}</h2>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        {note.content && (
          <div className="note-entry-list">
            <div className="note-entry">
              <span className="note-entry-marker" />
              <div>
                <time>{timeLabel(note.created_at)}</time>
                <p>{note.content}</p>
              </div>
            </div>
          </div>
        )}
        <form className="note-add-entry" onSubmit={addEntry}>
          <label>Add an entry</label>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="What's on your mind now?" rows={3} />
          <div className="note-add-entry-foot">
            <span>Every entry gets its own timestamp.</span>
            <button className="btn-primary" disabled={saving || !draft.trim()}>{saving ? "Saving…" : "Add entry"} <span className="btn-icon">↑</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CALENDAR / LIFE HISTORY
   ═══════════════════════════════════════════ */
function CalendarPage({ user, setNotice }: { user: User; setNotice: (m: string) => void }) {
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [dayEvents, setDayEvents] = useState<HistoryEvent[]>([]);
  const [winDraft, setWinDraft] = useState("");

  const refresh = useCallback(async () => {
    const yearMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    setEvents(await historyRepository.getEventsForMonth(user.id, yearMonth));
    setDayEvents(await historyRepository.getEventsForDate(user.id, selectedDate));
  }, [user.id, month, selectedDate]);

  useEffect(() => { void refresh(); }, [refresh]);

  function prevMonth() { setMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; }); }
  function nextMonth() { setMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; }); }

  function getCalendarDays(): { date: string; day: number; isCurrentMonth: boolean; isToday: boolean }[] {
    const year = month.getFullYear();
    const mo = month.getMonth();
    const firstDay = new Date(year, mo, 1).getDay();
    const daysInMonth = new Date(year, mo + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, mo, 0).getDate();
    const today = todayStr();
    const days: { date: string; day: number; isCurrentMonth: boolean; isToday: boolean }[] = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prev = new Date(year, mo - 1, d);
      days.push({ date: prev.toISOString().split("T")[0], day: d, isCurrentMonth: false, isToday: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ date: dateStr, day: d, isCurrentMonth: true, isToday: dateStr === today });
    }
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const next = new Date(year, mo + 1, d);
      days.push({ date: next.toISOString().split("T")[0], day: d, isCurrentMonth: false, isToday: false });
    }
    return days;
  }

  const eventDates = useMemo(() => {
    const map = new Map<string, Set<string>>();
    events.forEach(e => {
      if (!map.has(e.date)) map.set(e.date, new Set());
      map.get(e.date)!.add(e.type);
    });
    return map;
  }, [events]);

  async function addWin(type: "small_win" | "big_win") {
    if (!winDraft.trim()) return;
    if (type === "small_win") await historyRepository.recordSmallWin(user.id, winDraft.trim());
    else await historyRepository.recordBigWin(user.id, winDraft.trim());
    setWinDraft("");
    await refresh();
    setNotice(`${type === "big_win" ? "🏆 Big" : "✨ Small"} win recorded!`);
  }

  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const calDays = getCalendarDays();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function eventIcon(type: string): string {
    const icons: Record<string, string> = { habit_milestone: "🏆", goal_completed: "🎯", goal_created: "◎", small_win: "✨", big_win: "🏅", note: "📝", check_in: "✓", weekly_review: "📋", fresh_start: "🌱", custom: "•" };
    return icons[type] ?? "•";
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <div className="eyebrow">YOUR JOURNEY, DAY BY DAY</div>
          <h1>Life History<span className="heading-dot">.</span></h1>
          <p>Milestones, wins, notes, and meaningful moments — all in one timeline.</p>
        </div>
      </div>

      <div className="calendar-layout">
        <div>
          <div className="calendar-nav">
            <div className="calendar-nav-buttons">
              <button onClick={prevMonth}>←</button>
              <button onClick={() => { setMonth(new Date()); setSelectedDate(todayStr()); }}>Today</button>
              <button onClick={nextMonth}>→</button>
            </div>
            <h3>{monthLabel}</h3>
          </div>
          <div className="calendar-grid">
            <div className="calendar-weekdays">
              {weekdays.map(d => <div key={d} className="calendar-weekday">{d}</div>)}
            </div>
            <div className="calendar-days">
              {calDays.map(d => {
                const types = eventDates.get(d.date);
                return (
                  <div key={d.date}
                    className={`calendar-day${d.isToday ? " today" : ""}${d.date === selectedDate ? " selected" : ""}${!d.isCurrentMonth ? " other-month" : ""}`}
                    onClick={() => setSelectedDate(d.date)}>
                    <span className="day-number">{d.day}</span>
                    {types && (
                      <div className="day-dots">
                        {types.has("check_in") && <span className="day-dot habit" />}
                        {types.has("note") && <span className="day-dot note" />}
                        {(types.has("small_win") || types.has("big_win")) && <span className="day-dot win" />}
                        {(types.has("goal_completed") || types.has("goal_created")) && <span className="day-dot goal" />}
                        {types.has("habit_milestone") && <span className="day-dot win" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="day-detail-panel">
          <h3>{new Date(selectedDate + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h3>
          <div className="day-date">{selectedDate}</div>
          <div className="day-events">
            {dayEvents.length > 0 ? dayEvents.map(event => (
              <div key={event.id} className="day-event-item">
                <div className={`event-type-icon ${event.type.includes("habit") || event.type === "check_in" ? "habit" : event.type.includes("win") ? "win" : event.type.includes("goal") ? "goal" : "note"}`}>
                  {eventIcon(event.type)}
                </div>
                <div className="day-event-text">
                  <strong>{event.title}</strong>
                  {event.description && <p>{event.description}</p>}
                  <small>{event.type.replace(/_/g, " ")}</small>
                </div>
              </div>
            )) : <div className="day-no-events">Nothing recorded for this day yet.</div>}
          </div>
          <div className="add-win-form">
            <input value={winDraft} onChange={e => setWinDraft(e.target.value)} placeholder="Record a win for this day…" />
            <div className="add-win-buttons">
              <button className="btn-secondary" onClick={() => void addWin("small_win")} disabled={!winDraft.trim()}>✨ Small win</button>
              <button className="btn-primary" onClick={() => void addWin("big_win")} disabled={!winDraft.trim()} style={{ padding: "6px 12px", fontSize: "11px" }}>🏅 Big win</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   PRAISE PAGE
   ═══════════════════════════════════════════ */
function PraisePage({ user }: { user: User }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);

  useEffect(() => {
    void (async () => {
      const [g, e, h] = await Promise.all([
        goalsRepository.getGoals(user.id),
        historyRepository.getEvents(user.id),
        habitsRepository.getAllHabits(user.id),
      ]);
      setGoals(g); setEvents(e); setHabits(h);
    })();
  }, [user.id]);

  const completedGoals = goals.filter(g => g.status === "completed");
  const wins = events.filter(e => e.type === "small_win" || e.type === "big_win");
  const allMilestones = habits.flatMap(h => h.milestones.map(m => ({ ...m, habitName: h.name })));

  const stickers = [
    { id: "spark", label: "First Spark", icon: "🌱", desc: "Planted your first habit", unlocked: habits.length > 0 },
    { id: "streak3", label: "Momentum", icon: "⚡", desc: "Achieved a 3-day habit streak", unlocked: habits.some(h => habitsRepository.computeStats(h).longestStreak >= 3) },
    { id: "streak7", label: "Unstoppable", icon: "🔥", desc: "Achieved a 7-day habit streak", unlocked: habits.some(h => habitsRepository.computeStats(h).longestStreak >= 7) },
    { id: "integration", label: "Habit Integration", icon: "💎", desc: "Reached 21 days of practice", unlocked: habits.some(h => habitsRepository.computeStats(h).longestStreak >= 21) },
    { id: "mastery", label: "True Mastery", icon: "👑", desc: "Reached 66 days of continuous mastery", unlocked: habits.some(h => habitsRepository.computeStats(h).longestStreak >= 66) },
    { id: "goal_crusher", label: "Goal Crusher", icon: "🎯", desc: "Completed an L1-L4 ladder goal", unlocked: completedGoals.length > 0 },
    { id: "win_hunter", label: "Win Hunter", icon: "✨", desc: "Recorded 3 or more wins", unlocked: wins.length >= 3 },
    { id: "resilient", label: "Resilient Spirit", icon: "🛡️", desc: "Preserved a streak with Grace Day", unlocked: habits.some(h => h.grace_days.length > 0) },
  ];

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <div className="eyebrow">EVIDENCE OF FOLLOW-THROUGH</div>
          <h1>Praise<span className="heading-dot">.</span></h1>
          <p>Achieved goals, milestones, stickers, and evidence that you follow through.</p>
        </div>
      </div>

      <div className="praise-sections">
        {/* Stickers & Badges Delight Section */}
        <div className="praise-section">
          <h3><span className="praise-icon">✨</span> Delight Stickers & Milestones</h3>
          <div className="stickers-grid">
            {stickers.map(s => (
              <div key={s.id} className={`sticker-reward-card ${s.unlocked ? "unlocked" : "locked"}`}>
                <div className="sticker-reward-icon">{s.icon}</div>
                <h4>{s.label}</h4>
                <p>{s.desc}</p>
                <span className="sticker-status-tag">{s.unlocked ? "UNLOCKED" : "LOCKED"}</span>
              </div>
            ))}
          </div>
        </div>

        {completedGoals.length > 0 && (
          <div className="praise-section">
            <h3><span className="praise-icon">🎯</span> Achieved Goals</h3>
            <div className="wins-grid">
              {completedGoals.map(goal => (
                <div key={goal.id} className="win-card goal-win">
                  <div className="win-type">GOAL ACHIEVED</div>
                  <h4>{goal.title}</h4>
                  {goal.why && <p>{goal.why}</p>}
                  <div className="win-date">{goal.completed_at ? new Date(goal.completed_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : ""}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {wins.length > 0 && (
          <div className="praise-section">
            <h3><span className="praise-icon">✨</span> Wins</h3>
            <div className="wins-grid">
              {wins.map(win => (
                <div key={win.id} className={`win-card ${win.type === "big_win" ? "big-win" : "small-win"}`}>
                  <div className="win-type">{win.type === "big_win" ? "BIG WIN" : "SMALL WIN"}</div>
                  <h4>{win.title}</h4>
                  {win.description && <p>{win.description}</p>}
                  <div className="win-date">{new Date(win.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {allMilestones.length > 0 && (
          <div className="praise-section">
            <h3><span className="praise-icon">🏆</span> Habit Milestones</h3>
            <div className="milestones-grid">
              {allMilestones.map(m => (
                <div key={m.id} className="milestone-badge">
                  <div className="badge-icon" style={{ background: "var(--accent-success-soft)", color: "var(--accent-success)" }}>🏆</div>
                  <div className="badge-days">{m.days}</div>
                  <div className="badge-label">{m.label}</div>
                  <div className="badge-habit">{m.habitName}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {completedGoals.length === 0 && wins.length === 0 && allMilestones.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">★</div>
            <h3>Your praise wall is growing.</h3>
            <p>Complete goals, build streaks, and record wins. They'll all appear here as evidence of your follow-through.</p>
          </div>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   SUMMARIES PAGE (DAILY SUMMARY & WEEKLY REVIEW)
   ═══════════════════════════════════════════ */
function SummariesPage({ user, setNotice }: { user: User; setNotice: (m: string) => void }) {
  const [tab, setTab] = useState<"daily" | "weekly">("daily");
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [reflection, setReflection] = useState("");
  const [savingReflection, setSavingReflection] = useState(false);

  // Weekly review form fields
  const [worked, setWorked] = useState("");
  const [blocked, setBlocked] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [priority, setPriority] = useState("");
  const quote = useMemo(() => getWeeklyQuote(), []);

  const refresh = useCallback(async () => {
    const [h, t, n, e] = await Promise.all([
      habitsRepository.getHabits(user.id),
      tasksRepository.getTasks(user.id),
      notesRepository.getNotes(user.id),
      historyRepository.getEvents(user.id),
    ]);
    setHabits(h); setTasks(t); setNotes(n); setEvents(e);
  }, [user.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Daily summary calculations
  const dailyTasks = tasks.filter(t => t.date === selectedDate);
  const dailyCompletedTasks = dailyTasks.filter(t => t.done);
  const dailyCheckedHabits = habits.filter(h => h.check_ins.some(ci => ci.date === selectedDate && ci.performed));
  const dailyNotes = notes.filter(n => n.created_at.startsWith(selectedDate) || n.updated_at.startsWith(selectedDate));
  const dailyEvents = events.filter(e => e.date === selectedDate);
  const dailyReflections = dailyEvents.filter(e => e.type === "daily_reflection");

  async function saveDailyReflection(e: FormEvent) {
    e.preventDefault();
    if (!reflection.trim()) return;
    setSavingReflection(true);
    try {
      await historyRepository.addEvent(user.id, {
        type: "daily_reflection",
        title: `Reflection for ${selectedDate}`,
        description: reflection.trim(),
        metadata: { date: selectedDate },
      });
      setReflection("");
      await refresh();
      setNotice("Daily reflection saved.");
    } finally {
      setSavingReflection(false);
    }
  }

  // Weekly review calculations
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const weekCheckIns = habits.reduce((sum, h) => sum + h.check_ins.filter(ci => ci.date >= weekStartStr && ci.performed).length, 0);
  const weekTasks = tasks.filter(t => t.date >= weekStartStr && t.done).length;
  const weekWins = events.filter(e => e.date >= weekStartStr && (e.type === "small_win" || e.type === "big_win")).length;

  async function saveWeeklyReview() {
    if (worked.trim() || blocked.trim() || adjustment.trim() || priority.trim()) {
      await historyRepository.addEvent(user.id, {
        type: "weekly_review",
        title: "Weekly Review",
        description: `Worked: ${worked}\nBlocked: ${blocked}\nAdjustment: ${adjustment}\nPriority: ${priority}`,
        metadata: { worked, blocked, adjustment, priority },
      });
      setNotice("Weekly review saved!");
      setWorked(""); setBlocked(""); setAdjustment(""); setPriority("");
      await refresh();
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <div className="eyebrow">PERSPECTIVE & REFLECTION</div>
          <h1>Summaries & Review<span className="heading-dot">.</span></h1>
          <p>Deterministic views of your progress and regular reset loops.</p>
        </div>
      </div>

      <div className="summaries-tab-bar">
        <button className={`summary-tab-btn ${tab === "daily" ? "active" : ""}`} onClick={() => setTab("daily")}>
          ◷ Daily Summary
        </button>
        <button className={`summary-tab-btn ${tab === "weekly" ? "active" : ""}`} onClick={() => setTab("weekly")}>
          ☰ Sunday Weekly Review
        </button>
      </div>

      {tab === "daily" ? (
        <div className="daily-summary-layout">
          <div className="daily-date-picker-row">
            <label htmlFor="daily-date-picker" style={{ fontSize: "12px", fontWeight: 600 }}>Viewing day:</label>
            <input
              id="daily-date-picker"
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
            {selectedDate === todayStr() && <span style={{ fontSize: "11px", color: "var(--accent-primary)", fontWeight: 600 }}>(Today)</span>}
          </div>

          <div className="daily-stats-grid">
            <div className="daily-summary-card">
              <h3><span>⟳</span> Habit Check-Ins</h3>
              <p style={{ fontSize: "24px", fontWeight: 700, margin: "8px 0" }}>
                {dailyCheckedHabits.length} <span style={{ fontSize: "14px", color: "var(--text-tertiary)" }}>/ {habits.length}</span>
              </p>
              <div className="summary-item-list">
                {habits.map(h => {
                  const done = h.check_ins.some(ci => ci.date === selectedDate && ci.performed);
                  return (
                    <div key={h.id} className="summary-item">
                      <span className="item-title">{h.name}</span>
                      <span className="item-status" style={{ color: done ? "var(--accent-success)" : "var(--text-tertiary)" }}>
                        {done ? "✓ Done" : "Not marked"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="daily-summary-card">
              <h3><span>✓</span> Tasks Completed</h3>
              <p style={{ fontSize: "24px", fontWeight: 700, margin: "8px 0" }}>
                {dailyCompletedTasks.length} <span style={{ fontSize: "14px", color: "var(--text-tertiary)" }}>/ {dailyTasks.length}</span>
              </p>
              <div className="summary-item-list">
                {dailyTasks.length > 0 ? dailyTasks.map(t => (
                  <div key={t.id} className="summary-item">
                    <span className="item-title" style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.text}</span>
                    <span className="item-status" style={{ color: t.done ? "var(--accent-success)" : "var(--text-tertiary)" }}>
                      {t.done ? "Completed" : "Pending"}
                    </span>
                  </div>
                )) : (
                  <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "4px 0" }}>No tasks logged for this day.</div>
                )}
              </div>
            </div>

            <div className="daily-summary-card">
              <h3><span>▤</span> Notes Captured</h3>
              <p style={{ fontSize: "24px", fontWeight: 700, margin: "8px 0" }}>{dailyNotes.length}</p>
              <div className="summary-item-list">
                {dailyNotes.length > 0 ? dailyNotes.map(n => (
                  <div key={n.id} className="summary-item">
                    <span className="item-title">{n.title}</span>
                    <span className="item-status" style={{ color: "var(--text-secondary)" }}>Note</span>
                  </div>
                )) : (
                  <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "4px 0" }}>No notes captured on this day.</div>
                )}
              </div>
            </div>

            <div className="daily-summary-card">
              <h3><span>✨</span> Wins & Milestones</h3>
              <p style={{ fontSize: "24px", fontWeight: 700, margin: "8px 0" }}>
                {dailyEvents.filter(e => e.type.includes("win") || e.type.includes("milestone")).length}
              </p>
              <div className="summary-item-list">
                {dailyEvents.length > 0 ? dailyEvents.map(e => (
                  <div key={e.id} className="summary-item">
                    <span className="item-title">{e.title}</span>
                    <span className="item-status" style={{ color: "var(--accent-primary)" }}>{e.type.replace(/_/g, " ")}</span>
                  </div>
                )) : (
                  <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "4px 0" }}>No wins logged on this day.</div>
                )}
              </div>
            </div>
          </div>

          <div className="daily-reflection-box">
            <h4>Daily Reflection & Investment</h4>
            <p>A 5-second note or one-word reflection to close out the day.</p>
            {dailyReflections.map(r => (
              <div key={r.id} style={{ padding: "8px 12px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", marginBottom: "10px", fontSize: "13px" }}>
                "{r.description}"
              </div>
            ))}
            <form onSubmit={saveDailyReflection}>
              <textarea
                value={reflection}
                onChange={e => setReflection(e.target.value)}
                placeholder="How did today feel? What was the dominant tone? (e.g., 'Grounded', 'Rushed but steady')…"
              />
              <button className="btn-primary" type="submit" disabled={!reflection.trim() || savingReflection}>
                Save daily reflection <span className="btn-icon">↑</span>
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="review-sections">
          <div className="review-card">
            <h3>This Week's Progress</h3>
            <div className="review-stat-grid">
              <div className="review-stat"><strong>{weekCheckIns}</strong><small>HABIT CHECK-INS</small></div>
              <div className="review-stat"><strong>{weekTasks}</strong><small>TASKS COMPLETED</small></div>
              <div className="review-stat"><strong>{weekWins}</strong><small>WINS RECORDED</small></div>
            </div>
          </div>

          <div className="review-card">
            <h3>Reflect & Adjust</h3>
            <p style={{ fontStyle: "italic", color: "var(--text-secondary)", marginBottom: "var(--space-md)", fontSize: "13px" }}>
              "{quote.text}"
            </p>
            <div className="review-question">
              <label>What worked this week?</label>
              <textarea value={worked} onChange={e => setWorked(e.target.value)} placeholder="The things that went well…" />
            </div>
            <div className="review-question">
              <label>What blocked you?</label>
              <textarea value={blocked} onChange={e => setBlocked(e.target.value)} placeholder="What got in the way…" />
            </div>
            <div className="review-question">
              <label>What one adjustment will you make? (If–then repair)</label>
              <textarea value={adjustment} onChange={e => setAdjustment(e.target.value)} placeholder="If [situation], then I will [action]…" />
            </div>
            <div className="review-question">
              <label>What's your one priority for next week?</label>
              <textarea value={priority} onChange={e => setPriority(e.target.value)} placeholder="The single most important objective…" />
            </div>
            <button className="btn-primary" onClick={() => void saveWeeklyReview()}>Save review <span className="btn-icon">↑</span></button>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   SAVED ITEMS LIBRARY (§7.12)
   ═══════════════════════════════════════════ */
function SavedItemsPage({ user, setNotice }: { user: User; setNotice: (m: string) => void }) {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterRead, setFilterRead] = useState<"all" | "unread" | "read">("all");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setItems(await savedItemsRepository.getItems(user.id));
  }, [user.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);
    await savedItemsRepository.saveItem(user.id, {
      title: title.trim(),
      url: url.trim(),
      description: description.trim(),
      tags,
    });
    setTitle(""); setUrl(""); setDescription(""); setTagsInput(""); setShowAdd(false);
    await refresh();
    setNotice("Item saved to library.");
  }

  async function toggleRead(id: string) {
    await savedItemsRepository.toggleRead(user.id, id);
    await refresh();
  }

  async function deleteItem(id: string) {
    await savedItemsRepository.deleteItem(user.id, id);
    await refresh();
    setNotice("Item removed.");
  }

  const allTags = Array.from(new Set(items.flatMap(i => i.tags)));

  const filtered = items.filter(i => {
    if (filterRead === "unread" && i.is_read) return false;
    if (filterRead === "read" && !i.is_read) return false;
    if (filterTag && !i.tags.includes(filterTag)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.url.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <div className="eyebrow">YOUR KNOWLEDGE & INSPIRATION</div>
          <h1>Saved Library<span className="heading-dot">.</span></h1>
          <p>Articles, links, and references saved locally for thoughtful retrieval.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
          <span className="btn-icon">＋</span> Save item
        </button>
      </div>

      {showAdd && (
        <form className="habit-form-card" onSubmit={handleAdd} style={{ marginBottom: "var(--space-lg)" }}>
          <h3>Save an Article or Link</h3>
          <div className="form-group">
            <label>Title <span className="form-hint">Required</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Deep Work Principles" required autoFocus />
          </div>
          <div className="form-group">
            <label>URL <span className="form-hint">Optional</span></label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="form-group">
            <label>Summary / Notes <span className="form-hint">Optional</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Why you saved this, key quotes, or takeaways…" />
          </div>
          <div className="form-group">
            <label>Tags <span className="form-hint">Comma-separated</span></label>
            <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="e.g., focus, reading, health" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn-primary" disabled={!title.trim()}>Save item <span className="btn-icon">↑</span></button>
          </div>
        </form>
      )}

      <div className="saved-toolbar">
        <div className="filter-tabs">
          <button className={filterRead === "all" ? "active" : ""} onClick={() => setFilterRead("all")}>All {items.length}</button>
          <button className={filterRead === "unread" ? "active" : ""} onClick={() => setFilterRead("unread")}>Unread {items.filter(i => !i.is_read).length}</button>
          <button className={filterRead === "read" ? "active" : ""} onClick={() => setFilterRead("read")}>Read {items.filter(i => i.is_read).length}</button>
        </div>
        <input
          className="saved-search-input"
          placeholder="Search saved items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {allTags.length > 0 && (
        <div className="tags-filter-bar">
          <button className={`tag-chip ${filterTag === null ? "active" : ""}`} onClick={() => setFilterTag(null)}>All tags</button>
          {allTags.map(tag => (
            <button key={tag} className={`tag-chip ${filterTag === tag ? "active" : ""}`} onClick={() => setFilterTag(filterTag === tag ? null : tag)}>
              #{tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="saved-grid">
          {filtered.map(item => (
            <div key={item.id} className={`saved-card ${item.is_read ? "read" : ""}`}>
              <div className="saved-card-header">
                <h4>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      {item.title} ↗
                    </a>
                  ) : item.title}
                </h4>
              </div>

              {item.url && <span className="saved-url-badge">{new URL(item.url).hostname.replace("www.", "")}</span>}

              {item.description && <p>{item.description}</p>}

              {item.tags.length > 0 && (
                <div className="saved-tags">
                  {item.tags.map(t => <span key={t} className="saved-tag-pill">#{t}</span>)}
                </div>
              )}

              <div className="saved-card-footer">
                <span>{new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <div className="saved-card-actions">
                  <button className="btn-secondary btn-sm" onClick={() => void toggleRead(item.id)}>
                    {item.is_read ? "Mark unread" : "✓ Mark read"}
                  </button>
                  <button className="icon-btn-danger" onClick={() => void deleteItem(item.id)} title="Delete item">×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🔖</div>
          <h3>{items.length === 0 ? "No saved items yet." : "No matches found."}</h3>
          <p>{items.length === 0 ? "Save links, articles, and reading material to review at your own pace." : "Try adjusting your search or filters."}</p>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   SETTINGS PAGE
   ═══════════════════════════════════════════ */
function SettingsPage({ user, theme, onThemeChange, setNotice }: { user: User; theme: string; onThemeChange: (t: "light" | "dark" | "system") => void; setNotice: (m: string) => void }) {
  async function handleExport() {
    try {
      const [notes, goals, habits, tasks, saved, history] = await Promise.all([
        notesRepository.getNotes(user.id),
        goalsRepository.getGoals(user.id),
        habitsRepository.getAllHabits(user.id),
        tasksRepository.getTasks(user.id),
        savedItemsRepository.getItems(user.id),
        historyRepository.getEvents(user.id),
      ]);
      const prefs = preferencesRepository.get(user.id);
      const backup = {
        version: 1,
        exported_at: new Date().toISOString(),
        user_id: user.id,
        user_email: user.email,
        data: {
          notes,
          goals,
          habits,
          tasks,
          saved_items: saved,
          history_events: history,
          preferences: prefs,
        },
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `superhuman-backup-${todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`Export complete! Downloaded superhuman-backup-${todayStr()}.json encompassing notes, goals, habits, tasks, saved items, history events, and preferences.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Export failed.");
    }
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { version?: number; data?: Record<string, unknown> };
      if (!parsed || !parsed.data || typeof parsed.data !== "object") {
        throw new Error("Invalid backup JSON format. Missing root 'data' object.");
      }
      
      const d = parsed.data;
      let count = 0;
      if (Array.isArray(d.notes)) {
        localStorage.setItem(`superhuman:user:${user.id}:notes`, JSON.stringify({ version: 1, data: d.notes }));
        count += d.notes.length;
      }
      if (Array.isArray(d.goals)) {
        localStorage.setItem(`superhuman:user:${user.id}:goals`, JSON.stringify({ version: 1, data: d.goals }));
        count += d.goals.length;
      }
      if (Array.isArray(d.habits)) {
        localStorage.setItem(`superhuman:user:${user.id}:habits`, JSON.stringify({ version: 1, data: d.habits }));
        count += d.habits.length;
      }
      if (Array.isArray(d.tasks)) {
        localStorage.setItem(`superhuman:user:${user.id}:tasks`, JSON.stringify({ version: 1, data: d.tasks }));
        count += d.tasks.length;
      }
      if (Array.isArray(d.saved_items)) {
        localStorage.setItem(`superhuman:user:${user.id}:saved_items`, JSON.stringify({ version: 1, data: d.saved_items }));
        count += d.saved_items.length;
      }
      if (Array.isArray(d.history_events)) {
        localStorage.setItem(`superhuman:user:${user.id}:history`, JSON.stringify({ version: 1, data: d.history_events }));
        count += d.history_events.length;
      }
      if (d.preferences && typeof d.preferences === "object") {
        localStorage.setItem(`superhuman:user:${user.id}:preferences`, JSON.stringify({ version: 1, data: d.preferences }));
      }

      setNotice(`Backup imported successfully! Restored ${count} records across notes, goals, habits, tasks, saved items, and history. Reloading…`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to import backup file. Ensure it is a valid Superhuman JSON backup.");
    }
  }

  function handleResetOnboarding() {
    if (!window.confirm("Re-run onboarding flow? You'll be taken through the identity statement, L1–L4 goals, and initial habit setup wizard again.")) return;
    preferencesRepository.setOnboardingCompleted(user.id, false);
    window.location.reload();
  }

  function handleClearData() {
    const firstConfirm = window.confirm(
      "⚠️ SAFELY WIPE LOCAL DATA:\n\nAre you sure you want to permanently erase all local productivity records (notes, habits, check-ins, goals, tasks, saved library, history, and preferences) from this browser?\n\nThis action cannot be undone."
    );
    if (!firstConfirm) return;

    const secondConfirm = window.confirm(
      "FINAL CONFIRMATION:\n\nPress OK to permanently wipe all local productivity data now."
    );
    if (!secondConfirm) return;

    const prefix = `superhuman:user:${user.id}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    setNotice("All local productivity data successfully wiped from this browser.");
    setTimeout(() => window.location.reload(), 800);
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <div className="eyebrow">YOUR PREFERENCES</div>
          <h1>Settings<span className="heading-dot">.</span></h1>
          <p>Customize your experience, manage local data portability, and configure preferences.</p>
        </div>
      </div>

      <div className="settings-sections">
        <div className="settings-card">
          <h3>Appearance</h3>
          <div className="setting-row">
            <div className="setting-info">
              <h4>Theme</h4>
              <p>Choose light, dark, or match your system.</p>
            </div>
            <div className="theme-options">
              {(["light", "dark", "system"] as const).map(t => (
                <button key={t} className={`theme-option${theme === t ? " active" : ""}`} onClick={() => onThemeChange(t)}>
                  {t === "light" ? "☀ Light" : t === "dark" ? "☽ Dark" : "◐ System"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Settings & Local Data Portability (PRD §7.14) */}
        <div className="settings-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
            <h3 style={{ margin: 0 }}>Settings &amp; Local Data Portability (PRD §7.14)</h3>
            <span className="badge badge-accent">Local-First • Device Only</span>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <h4>Export Local Data</h4>
              <p>Downloads a complete formatted JSON backup (<code>superhuman-backup-&#123;date&#125;.json</code>) encompassing notes, goals, habits, tasks, saved items, history events, and preferences.</p>
              <div className="backup-actions-row">
                <button className="btn-secondary" onClick={() => void handleExport()}>
                  📥 Export Local Data (JSON)
                </button>
              </div>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <h4>Import Local Data</h4>
              <p>Uploads and validates JSON backups to restore local productivity databases.</p>
              <div className="backup-actions-row">
                <label className="btn-secondary" style={{ cursor: "pointer" }}>
                  📤 Import Local Data (JSON)
                  <input
                    type="file"
                    accept=".json"
                    style={{ display: "none" }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) void handleImport(file);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Fresh Starts */}
        <div className="settings-card">
          <h3>Fresh Starts</h3>
          <div className="setting-row">
            <div className="setting-info">
              <h4>Re-run Onboarding Flow</h4>
              <p>Re-run the identity statement, L1–L4 goals, and initial habit setup wizard without losing any existing items.</p>
            </div>
            <button className="btn-secondary" onClick={handleResetOnboarding}>
              🔄 Re-run Onboarding Flow
            </button>
          </div>
        </div>

        {/* Danger Zone: Safely Wipe Local Data with confirmation dialogs */}
        <div className="settings-card danger-zone">
          <h3>Danger Zone</h3>
          <div className="setting-row">
            <div className="setting-info">
              <h4>Safely Wipe Local Data</h4>
              <p>Safely wipe local data with confirmation dialogs. Permanently erases all productivity records (notes, habits, check-ins, goals, tasks, saved library, history, and preferences) for this account from this browser. This action cannot be undone.</p>
            </div>
            <button className="btn-danger" onClick={handleClearData}>
              🗑️ Safely Wipe Local Data
            </button>
          </div>
        </div>

        <div className="settings-card">
          <h3>Account & About</h3>
          <div className="setting-row">
            <div className="setting-info">
              <h4>Account</h4>
              <p>{user.email} · {user.role}</p>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <h4>Superhuman Phase 1</h4>
              <p>Local-first personal productivity and habit compounding. Private, offline-ready, and deliberate.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   ADMIN PANEL
   ═══════════════════════════════════════════ */
type AdminSummary = { users: number; cloudflareAccounts: number; dataDatabases: number; userMappings: number };

function AdminPanel({ setNotice }: { setNotice: (m: string) => void }) {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [s, u] = await Promise.all([
          api<AdminSummary>("/api/admin/dashboard"),
          api<{ items: Record<string, unknown>[] }>("/api/admin/users"),
        ]);
        setSummary(s); setUsers(u.items);
      } catch (e) { setNotice(e instanceof Error ? e.message : "Could not load admin data."); }
      finally { setLoading(false); }
    })();
  }, [setNotice]);

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <div className="eyebrow">CONTROL CENTER</div>
          <h1>Admin<span className="heading-dot">.</span></h1>
          <p>Account and infrastructure metadata from Control D1.</p>
        </div>
        <span className="admin-badge">ADMIN ACCESS</span>
      </div>

      {loading ? <div className="empty-state"><p>Loading control data…</p></div> : (
        <>
          <div className="stats-grid">
            {[
              ["Registered users", summary?.users ?? 0, "◉"],
              ["CF Accounts", summary?.cloudflareAccounts ?? 0, "◎"],
              ["Data D1s", summary?.dataDatabases ?? 0, "▤"],
              ["User mappings", summary?.userMappings ?? 0, "⌁"],
            ].map(([label, value, icon]) => (
              <div className="stat-card" key={String(label)}>
                <span className="stat-icon">{icon}</span>
                <span className="stat-label">{label}</span>
                <strong>{value}</strong>
                <span className="stat-note">From Control D1</span>
              </div>
            ))}
          </div>
          <div className="admin-table-card">
            <div className="table-header"><h3>Users</h3><span>{users.length} records</span></div>
            {users.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead>
                  <tbody>{users.map((u, i) => <tr key={String(u.id ?? i)}><td>{String(u.email ?? "—")}</td><td>{String(u.role ?? "—")}</td><td>{String(u.status ?? "—")}</td><td>{String(u.created_at ?? "—")}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <div style={{ padding: "var(--space-lg)", color: "var(--text-tertiary)", fontSize: "11px" }}>No records.</div>}
          </div>
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   MOUNT
   ═══════════════════════════════════════════ */
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
