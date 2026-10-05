import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/index";

const base = "https://example.com";
const origin = { Origin: base };
type Note = { id: string; title: string; content: string; is_pinned: number };

async function post(path: string, body: unknown): Promise<Response> {
	return worker.fetch(new Request(`${base}${path}`, {
		method: "POST",
		headers: { ...origin, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	}), env, {} as ExecutionContext);
}

async function call(path: string, method: string, body?: unknown, cookie?: string, requestEnv: Env = env): Promise<Response> {
	return worker.fetch(new Request(`${base}${path}`, {
		method,
		headers: { ...(method !== "GET" ? origin : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	}), requestEnv, {} as ExecutionContext);
}

describe("authentication", () => {
	const email = `auth-${crypto.randomUUID()}@example.com`;
	let userId = "";
	let cookie = "";
	let noteId = "";

	beforeAll(async () => {
		// The Cloudflare Vitest D1 binding is isolated from Wrangler's local
		// migration database, so create the Control D1 auth schema in the test DB.
		await env.superhuman_control.prepare(`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active',
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			password_hash TEXT, role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))
		)`).run();
		await env.superhuman_control.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
			id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`).run();
		await env.superhuman_data_1.prepare(`CREATE TABLE IF NOT EXISTS notes (
			id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
			is_pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`).run();
		await env.superhuman_control.prepare("CREATE TABLE IF NOT EXISTS cloudflare_accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, cloudflare_account_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
		await env.superhuman_control.prepare("CREATE TABLE IF NOT EXISTS data_databases (id TEXT PRIMARY KEY, cloudflare_account_ref TEXT NOT NULL, name TEXT NOT NULL, d1_database_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active', current_size_bytes INTEGER NOT NULL DEFAULT 0, user_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
		await env.superhuman_control.prepare("CREATE TABLE IF NOT EXISTS user_database_mapping (user_id TEXT PRIMARY KEY, data_database_id TEXT NOT NULL, data_usage_bytes INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
		await env.superhuman_control.prepare("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'auth-%@example.com')").run();
		await env.superhuman_control.prepare("DELETE FROM users WHERE email LIKE 'auth-%@example.com'").run();
	});

	it("registers an account, creates an HTTP-only session, and exposes server-derived identity", async () => {
		const response = await post("/api/auth/register", { email: email.toUpperCase(), password: "correct horse battery staple" });
		expect(response.status).toBe(201);
		const setCookie = response.headers.get("Set-Cookie") ?? "";
		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("Secure");
		expect(setCookie).toContain("SameSite=Lax");
		cookie = setCookie.split(";")[0];
		const body = await response.json() as { user: { id: string; email: string; role: string } };
		userId = body.user.id;
		expect(body.user.email).toBe(email);
		expect(body.user.role).toBe("user");

		const me = await worker.fetch(new Request(`${base}/api/auth/me`, { headers: { Cookie: cookie } }), env, {} as ExecutionContext);
		expect(me.status).toBe(200);
		expect(await me.json()).toEqual({ user: { id: userId, email, role: "user" } });
	});

	it("requires auth and scopes note queries to the session user even when React sends another user_id", async () => {
		const unauthenticated = await worker.fetch(new Request(`${base}/api/notes`, { method: "GET" }), env, {} as ExecutionContext);
		expect(unauthenticated.status).toBe(401);
		const created = await call("/api/notes", "POST", { title: "Private thought", content: "Only mine", user_id: "attacker-controlled" }, cookie);
		expect(created.status).toBe(201);
		const createdBody = await created.json() as { note: Note };
		noteId = createdBody.note.id;
		expect(createdBody.note).not.toHaveProperty("user_id", "attacker-controlled");
		const firstUserNotes = await call("/api/notes", "GET", undefined, cookie);
		expect((await firstUserNotes.json() as { notes: Note[] }).notes.map(note => note.id)).toContain(noteId);

		const secondEmail = `auth-${crypto.randomUUID()}@example.com`;
		const secondResponse = await post("/api/auth/register", { email: secondEmail, password: "correct horse battery staple" });
		const secondCookie = (secondResponse.headers.get("Set-Cookie") ?? "").split(";")[0];
		const secondUserNotes = await call("/api/notes", "GET", undefined, secondCookie);
		expect((await secondUserNotes.json() as { notes: Note[] }).notes).toHaveLength(0);
		await env.superhuman_control.prepare("DELETE FROM users WHERE email = ?").bind(secondEmail).run();
	});

	it("does not grant admin privileges to self-registered users", async () => {
		const response = await worker.fetch(new Request(`${base}/api/admin/me`, { headers: { Cookie: cookie } }), env, {} as ExecutionContext);
		expect(response.status).toBe(403);
	});

	it("bootstraps only the configured admin email and serves metadata without exposing notes", async () => {
		const adminEmail = `owner-${crypto.randomUUID()}@example.com`;
		const adminPassword = "private admin password 2026";
		const adminEnv = { ...env, ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword };
		const denied = await call("/api/auth/login", "POST", { email: adminEmail, password: "incorrect password" }, undefined, adminEnv);
		expect(denied.status).toBe(401);
		const login = await call("/api/auth/login", "POST", { email: adminEmail, password: adminPassword }, undefined, adminEnv);
		expect(login.status).toBe(200);
		const adminCookie = (login.headers.get("Set-Cookie") ?? "").split(";")[0];
		const dashboard = await call("/api/admin/dashboard", "GET", undefined, adminCookie, adminEnv);
		expect(dashboard.status).toBe(200);
		const userData = await call("/api/admin/users", "GET", undefined, adminCookie, adminEnv);
		expect(userData.status).toBe(200);
		expect(await userData.text()).not.toContain("Private thought");
		await env.superhuman_control.prepare("DELETE FROM users WHERE email = ?").bind(adminEmail).run();
	});

	it("revokes the session on logout", async () => {
		const response = await post("/api/auth/logout", null);
		// This request has no cookie, so use a second request with the issued cookie.
		expect(response.status).toBe(204);
		const logout = await worker.fetch(new Request(`${base}/api/auth/logout`, { method: "POST", headers: { ...origin, Cookie: cookie } }), env, {} as ExecutionContext);
		expect(logout.status).toBe(204);
		const me = await worker.fetch(new Request(`${base}/api/auth/me`, { headers: { Cookie: cookie } }), env, {} as ExecutionContext);
		expect(me.status).toBe(401);
		await env.superhuman_data_1.prepare("DELETE FROM notes WHERE id = ?").bind(noteId).run();
		await env.superhuman_control.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
	});

	it("rejects invalid registration and cross-origin mutations", async () => {
		expect((await post("/api/auth/register", { email, password: "short" })).status).toBe(400);
		const response = await worker.fetch(new Request(`${base}/api/auth/register`, {
			method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
			body: JSON.stringify({ email, password: "correct horse battery staple" }),
		}), env, {} as ExecutionContext);
		expect(response.status).toBe(403);
	});
});
