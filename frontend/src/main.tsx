/// <reference types="vite/client" />
import React, { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

type User = { id: string; email: string; role: "user" | "admin" };
type Note = { id: string; title: string; content: string; is_pinned: number; created_at: string; updated_at: string };
type AdminSummary = { users: number; cloudflareAccounts: number; dataDatabases: number; userMappings: number };
type AdminData = { users: Record<string, unknown>[]; cloudflareAccounts: Record<string, unknown>[]; dataDatabases: Record<string, unknown>[]; userMappings: Record<string, unknown>[] };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [screen, setScreen] = useState<"notes" | "admin">("notes");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const result = await api<{ user: User }>("/api/auth/me");
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void loadUser(); }, [loadUser]);

  async function authenticate(mode: "login" | "register", email: string, password: string) {
    setBusy(true);
    setNotice("");
    try {
      const result = await api<{ user: User }>(`/api/auth/${mode}`, {
        method: "POST", body: JSON.stringify({ email, password }),
      });
      setUser(result.user);
      setScreen("notes");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      setUser(null);
      setScreen("notes");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <div className="boot"><span className="mark">s.</span><span>Getting your space ready…</span></div>;
  if (!user) return <AuthScreen onSubmit={authenticate} busy={busy} notice={notice} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="mark">s.</span><span>superhuman</span></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className={`nav-item ${screen === "notes" ? "active" : ""}`} onClick={() => setScreen("notes")}><span className="nav-icon">▤</span> My notes <span className="nav-arrow">↗</span></button>
      {user.role === "admin" && <>
        <div className="workspace-label admin-label">ADMINISTRATION</div>
        <button className={`nav-item ${screen === "admin" ? "active" : ""}`} onClick={() => setScreen("admin")}><span className="nav-icon">◫</span> Admin overview <span className="nav-arrow">↗</span></button>
      </>}
      <div className="sidebar-bottom"><div className="avatar">{user.email[0]?.toUpperCase()}</div><div className="profile-copy"><strong>{user.email}</strong><span>{user.role === "admin" ? "Administrator" : "Personal workspace"}</span></div><button className="icon-button logout-button" onClick={() => void logout()} title="Sign out" aria-label="Sign out">↪</button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> {screen === "notes" ? "My notes" : "Admin overview"}</div><div className="topbar-right"><span className="status-dot" /> Saved to your workspace</div></header>
      {screen === "admin" && user.role === "admin"
        ? <AdminPanel setNotice={setNotice} />
        : <NotesPanel setNotice={setNotice} />}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
    </main>
  </div>;
}

function AuthScreen({ onSubmit, busy, notice }: { onSubmit: (mode: "login" | "register", email: string, password: string) => Promise<void>; busy: boolean; notice: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); void onSubmit(mode, email, password); }
  return <div className="auth-page">
    <div className="auth-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-card card-one"><span className="mini-kicker">A THOUGHT TO KEEP</span><div className="scribble">Make room<br/>for good ideas.</div><span className="card-dot"/></div><div className="art-card card-two"><span className="mini-kicker">TODAY</span><div className="mini-lines"><i/><i/><i/></div><span className="tiny-check">✓</span></div><div className="art-caption">A little space for<br/>everything on your mind.</div><span className="art-spark spark-a">✳</span><span className="art-spark spark-b">✳</span></div>
    <div className="auth-side"><div className="auth-brand"><span className="mark">s.</span><span>superhuman</span></div><div className="auth-form-wrap"><div className="eyebrow">YOUR PERSONAL WORKSPACE</div><h1>{mode === "login" ? "Good to have you back." : "Start with a clean slate."}</h1><p className="auth-subtitle">{mode === "login" ? "Sign in to pick up where you left off." : "Create an account and make space for your thoughts."}</p>
      <div className="auth-tabs"><button className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")}>Sign in</button><button className={mode === "register" ? "selected" : ""} onClick={() => setMode("register")}>Create account</button></div>
      <form className="auth-form" onSubmit={submit}><label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === "register" ? "At least 12 characters" : "Your password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 12 : undefined} required /></label>{notice && <div className="form-error" role="alert">{notice}</div>}<button className="primary-button" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}<span>→</span></button></form>
      <div className="auth-footnote"><span className="lock">⌑</span> Your notes belong to you. Always.</div></div><div className="auth-legal">A quieter place to think <span>•</span> Superhuman prototype</div></div>
  </div>;
}

function NotesPanel({ setNotice }: { setNotice: (message: string) => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "pinned">("all");

  const refresh = useCallback(async () => {
    try { const result = await api<{ notes: Note[] }>("/api/notes"); setNotes(result.notes); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not load notes."); }
    finally { setLoading(false); }
  }, [setNotice]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api("/api/notes", { method: "POST", body: JSON.stringify({ title: title.trim(), content }) });
      setTitle(""); setContent(""); await refresh(); setNotice("Your note is saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save note."); }
    finally { setSaving(false); }
  }

  async function togglePin(note: Note) {
    try { await api(`/api/notes/${note.id}`, { method: "PATCH", body: JSON.stringify({ is_pinned: !note.is_pinned }) }); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not update note."); }
  }

  async function removeNote(note: Note) {
    try { await api(`/api/notes/${note.id}`, { method: "DELETE" }); await refresh(); setNotice("Note deleted."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not delete note."); }
  }

  const shown = notes.filter(note => filter === "all" || note.is_pinned === 1);
  return <section className="page-section"><div className="page-heading"><div><div className="eyebrow">YOUR PERSONAL SPACE</div><h1>Notes</h1><p>Catch a thought before it disappears.</p></div><div className="note-count"><strong>{notes.length.toString().padStart(2, "0")}</strong><span>NOTES</span></div></div>
    <form className="composer" onSubmit={addNote}><div className="composer-top"><span className="compose-icon">✳</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give this thought a title…" maxLength={160} required /></div><textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Start writing here. This space is yours." maxLength={50000} rows={3}/><div className="composer-bottom"><span>Only you can see your notes</span><button className="save-button" disabled={saving || !title.trim()}>{saving ? "Saving…" : "Save note"}<span>↗</span></button></div></form>
    <div className="notes-toolbar"><div><h2>Your collection</h2><span>{notes.length} {notes.length === 1 ? "thought" : "thoughts"}</span></div><div className="filter-tabs"><button className={filter === "all" ? "current" : ""} onClick={() => setFilter("all")}>All notes</button><button className={filter === "pinned" ? "current" : ""} onClick={() => setFilter("pinned")}>Pinned <span>⌑</span></button></div></div>
    {loading ? <div className="empty-state">Loading your notes…</div> : shown.length ? <div className="notes-grid">{shown.map((note, i) => <article className={`note-card tone-${i % 4}`} key={note.id}><div className="note-card-head"><span className="note-date">{new Date(note.updated_at.replace(" ", "T") + (note.updated_at.includes("Z") ? "" : "Z")).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><div className="note-actions"><button className={note.is_pinned ? "pinned" : ""} onClick={() => void togglePin(note)} title={note.is_pinned ? "Unpin note" : "Pin note"}>{note.is_pinned ? "◆" : "◇"}</button><button onClick={() => void removeNote(note)} title="Delete note">×</button></div></div><h3>{note.title}</h3><p>{note.content || <span className="muted-note">No extra details.</span>}</p><div className="note-card-foot"><span>{note.content.trim() ? `${note.content.trim().split(/\s+/).length} words` : "A new beginning"}</span><span className="note-spark">✳</span></div></article>)}</div> : <div className="empty-state"><span className="empty-icon">✳</span><h3>{filter === "pinned" ? "Nothing pinned yet" : "A fresh page"}</h3><p>{filter === "pinned" ? "Pin a note to keep it close at hand." : "Write your first note above. It will be waiting here when you return."}</p></div>}
  </section>;
}

function AdminPanel({ setNotice }: { setNotice: (message: string) => void }) {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const [overview, users, cloudflareAccounts, dataDatabases, userMappings] = await Promise.all([
        api<AdminSummary>("/api/admin/dashboard"),
        api<{ items: Record<string, unknown>[] }>("/api/admin/users"),
        api<{ items: Record<string, unknown>[] }>("/api/admin/cloudflare-accounts"),
        api<{ items: Record<string, unknown>[] }>("/api/admin/data-databases"),
        api<{ items: Record<string, unknown>[] }>("/api/admin/user-database-mappings"),
      ]);
      setSummary(overview); setData({ users: users.items, cloudflareAccounts: cloudflareAccounts.items, dataDatabases: dataDatabases.items, userMappings: userMappings.items });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load admin data."); }
    finally { setLoading(false); }
  }, [setNotice]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <section className="page-section admin-page"><div className="page-heading"><div><div className="eyebrow">CONTROL CENTER</div><h1>Admin overview</h1><p>Infrastructure and account metadata. Private notes are not shown here.</p></div><span className="admin-badge">ADMIN ACCESS</span></div>
    {loading ? <div className="empty-state">Loading control data…</div> : <>
      <div className="stats-grid">{[["Registered users", summary?.users ?? 0, "◉"], ["Cloudflare accounts", summary?.cloudflareAccounts ?? 0, "◎"], ["Data D1s", summary?.dataDatabases ?? 0, "▤"], ["User mappings", summary?.userMappings ?? 0, "⌁"]].map(([label, value, icon]) => <div className="stat-card" key={label}><span className="stat-icon">{icon}</span><span className="stat-label">{label}</span><strong>{value}</strong><span className="stat-note">From Control D1</span></div>)}</div>
      <AdminTable title="Users" rows={data?.users ?? []} columns={[["email", "Email"], ["role", "Role"], ["status", "Status"], ["created_at", "Joined"]]} />
      <AdminTable title="Cloudflare accounts" rows={data?.cloudflareAccounts ?? []} columns={[["name", "Account"], ["cloudflare_account_id", "Account ID"], ["status", "Status"]]} />
      <AdminTable title="Data D1s & storage" rows={data?.dataDatabases ?? []} columns={[["name", "Database"], ["status", "Status"], ["current_size_bytes", "Storage (bytes)"], ["user_count", "Users"]]} />
      <AdminTable title="User → Data D1 mapping" rows={data?.userMappings ?? []} columns={[["email", "User"], ["database_name", "Data D1"], ["data_usage_bytes", "Usage (bytes)"], ["status", "Status"]]} />
    </>}
  </section>;
}

function AdminTable({ title, rows, columns }: { title: string; rows: Record<string, unknown>[]; columns: [string, string][] }) {
  return <section className="admin-table-card"><div className="table-title"><h2>{title}</h2><span>{rows.length} records</span></div>{rows.length === 0 ? <div className="table-empty">Nothing here yet.</div> : <div className="table-scroll"><table><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={String(row.id ?? row.user_id ?? i)}>{columns.map(([key]) => <td key={key}>{String(row[key] ?? "—")}</td>)}</tr>)}</tbody></table></div>}</section>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
