export interface AuthEnv {
	superhuman_control: D1Database;
	FRONTEND_ORIGIN?: string;
}

export interface AuthenticatedUser {
	id: string;
	email: string;
	role: "user" | "admin";
}

const SESSION_COOKIE = "superhuman_session";
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 310_000;
const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
	const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function digest(value: string): Promise<string> {
	return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function derivePassword(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<string> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations },
		key,
		256,
	);
	return bytesToBase64Url(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await derivePassword(password, salt);
	return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algorithm, iterationText, saltText, expected] = stored.split("$");
	const iterations = Number(iterationText);
	if (algorithm !== "pbkdf2-sha256" || !Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !saltText || !expected) return false;
	const actual = await derivePassword(password, base64UrlToBytes(saltText), iterations);
	const a = encoder.encode(actual);
	const b = encoder.encode(expected);
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

function cookieValue(request: Request): string | null {
	for (const part of request.headers.get("Cookie")?.split(";") ?? []) {
		const [name, ...value] = part.trim().split("=");
		if (name === SESSION_COOKIE) return value.join("=") || null;
	}
	return null;
}

function sessionCookie(token: string, maxAge: number): string {
	return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
	return sessionCookie("", 0);
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
	const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
	const tokenHash = await digest(token);
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
	await db.prepare("INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
		.bind(crypto.randomUUID(), userId, tokenHash, expiresAt).run();
	return token;
}

export function setSessionCookie(response: Response, token: string): Response {
	response.headers.append("Set-Cookie", sessionCookie(token, SESSION_DAYS * 24 * 60 * 60));
	return response;
}

export async function revokeSession(request: Request, db: D1Database): Promise<void> {
	const token = cookieValue(request);
	if (token) await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await digest(token)).run();
}

export async function getAuthenticatedUser(request: Request, db: D1Database): Promise<AuthenticatedUser | null> {
	const token = cookieValue(request);
	if (!token) return null;
	const tokenHash = await digest(token);
	const now = new Date().toISOString();
	const user = await db.prepare(
		`SELECT u.id, u.email, u.role
		 FROM auth_sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active' LIMIT 1`,
	).bind(tokenHash, now).first<AuthenticatedUser>();
	return user ?? null;
}

export async function requireUser(request: Request, db: D1Database): Promise<AuthenticatedUser | Response> {
	const user = await getAuthenticatedUser(request, db);
	return user ?? Response.json({ error: "Authentication required" }, { status: 401 });
}

export async function requireAdmin(request: Request, db: D1Database, allowedAdminEmail?: string): Promise<AuthenticatedUser | Response> {
	const user = await requireUser(request, db);
	if (user instanceof Response) return user;
	const isAllowedAdmin = allowedAdminEmail?.trim().toLowerCase() === user.email.toLowerCase();
	return user.role === "admin" && isAllowedAdmin ? user : Response.json({ error: "Admin access required" }, { status: 403 });
}

export function isAuthenticatedUser(value: AuthenticatedUser | Response): value is AuthenticatedUser {
	return !(value instanceof Response);
}

export async function isTrustedMutation(request: Request, env: AuthEnv): Promise<boolean> {
	const origin = request.headers.get("Origin");
	const allowedOrigin = env.FRONTEND_ORIGIN ?? new URL(request.url).origin;
	return origin === allowedOrigin;
}

export function isValidEmail(value: unknown): value is string {
	return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidPassword(value: unknown): value is string {
	return typeof value === "string" && value.length >= 12 && value.length <= 256;
}

export async function parseJsonObject(request: Request, maxBytes = 4096): Promise<Record<string, unknown> | null> {
	const length = Number(request.headers.get("Content-Length") ?? "0");
	if (length > maxBytes) return null;
	try {
		const data: unknown = await request.json();
		return data !== null && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
	} catch {
		return null;
	}
}

export { digest as hashSessionToken };
