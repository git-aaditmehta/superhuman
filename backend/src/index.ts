import {
	clearSessionCookie,
	createSession,
	getAuthenticatedUser,
	hashPassword,
	isAuthenticatedUser,
	isTrustedMutation,
	isValidEmail,
	isValidPassword,
	parseJsonObject,
	requireAdmin,
	requireUser,
	revokeSession,
	setSessionCookie,
	verifyPassword,
} from "./auth";

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function withCors(response: Response, request: Request, env: Env): Response {
	const origin = request.headers.get("Origin");
	const allowedOrigin = env.FRONTEND_ORIGIN ?? new URL(request.url).origin;
	if (origin === allowedOrigin) {
		response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
		response.headers.set("Access-Control-Allow-Credentials", "true");
		response.headers.set("Access-Control-Allow-Headers", "Content-Type");
		response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
		response.headers.append("Vary", "Origin");
	}
	return response;
}

async function route(request: Request, env: Env): Promise<Response> {
	const { pathname } = new URL(request.url);
	const method = request.method;
	if (method === "OPTIONS") return new Response(null, { status: 204 });
	if (pathname === "/" && method === "GET") return Response.json({ service: "superhuman-api" });

	if (pathname === "/api/auth/register" && method === "POST") {
		if (!(await isTrustedMutation(request, env))) return jsonError("Untrusted request origin", 403);
		const body = await parseJsonObject(request);
		const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
		const password = body?.password;
		if (!isValidEmail(email) || !isValidPassword(password)) {
			return jsonError("Provide a valid email and a password of at least 12 characters", 400);
		}
		if (env.ADMIN_EMAIL?.trim().toLowerCase() === email) {
			return jsonError("This address is reserved for the configured administrator. Sign in instead.", 409);
		}
		const id = crypto.randomUUID();
		try {
			const passwordHash = await hashPassword(password);
			await env.superhuman_control.prepare(
				"INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'user')",
			).bind(id, email, passwordHash).run();
		} catch (error) {
			// Avoid leaking whether an address is registered, and handle unique-email races.
			if (error instanceof Error && /unique|constraint/i.test(error.message)) {
				return jsonError("Unable to create account. Check the details or try signing in.", 409);
			}
			throw error;
		}
		const token = await createSession(env.superhuman_control, id);
		return setSessionCookie(Response.json({ user: { id, email, role: "user" } }, {
			status: 201,
			headers: { "Cache-Control": "no-store" },
		}), token);
	}

	if (pathname === "/api/auth/login" && method === "POST") {
		if (!(await isTrustedMutation(request, env))) return jsonError("Untrusted request origin", 403);
		const body = await parseJsonObject(request);
		const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
		const password = body?.password;
		if (!isValidEmail(email) || typeof password !== "string" || password.length > 256) {
			return jsonError("Invalid email or password", 401);
		}
		const configuredAdminEmail = env.ADMIN_EMAIL?.trim().toLowerCase();
		const requestHost = new URL(request.url).hostname;
		if (requestHost === "localhost" || requestHost === "127.0.0.1") {
			console.info("Local login diagnostic", {
				adminEmailConfigured: Boolean(configuredAdminEmail),
				loginEmailMatchesAdmin: Boolean(configuredAdminEmail && email === configuredAdminEmail),
				adminPasswordConfigured: Boolean(env.ADMIN_PASSWORD),
				configuredAdminPasswordLengthValid: isValidPassword(env.ADMIN_PASSWORD),
				enteredPasswordLengthValid: isValidPassword(password),
			});
		}
		if (configuredAdminEmail && email === configuredAdminEmail) {
			if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD || !isValidPassword(password)) {
				return jsonError("Invalid email or password", 401);
			}
			const passwordHash = await hashPassword(password);
			const adminId = crypto.randomUUID();
			await env.superhuman_control.prepare(
				`INSERT INTO users (id, email, password_hash, role, status)
				 VALUES (?, ?, ?, 'admin', 'active')
				 ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash,
				 role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP`,
			).bind(adminId, email, passwordHash).run();
			const admin = await env.superhuman_control.prepare("SELECT id, email, role FROM users WHERE email = ?")
				.bind(email).first<{ id: string; email: string; role: "admin" }>();
			if (!admin) throw new Error("Admin account could not be loaded after bootstrap");
			const token = await createSession(env.superhuman_control, admin.id);
			return setSessionCookie(Response.json({ user: admin }, {
				headers: { "Cache-Control": "no-store" },
			}), token);
		}
		const user = await env.superhuman_control.prepare(
			"SELECT id, email, role, password_hash FROM users WHERE email = ? AND status = 'active' LIMIT 1",
		).bind(email).first<{ id: string; email: string; role: "user" | "admin"; password_hash: string | null }>();
		if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
			return jsonError("Invalid email or password", 401);
		}
		const token = await createSession(env.superhuman_control, user.id);
		return setSessionCookie(Response.json({ user: { id: user.id, email: user.email, role: user.role } }, {
			headers: { "Cache-Control": "no-store" },
		}), token);
	}

	if (pathname === "/api/auth/logout" && method === "POST") {
		if (!(await isTrustedMutation(request, env))) return jsonError("Untrusted request origin", 403);
		await revokeSession(request, env.superhuman_control);
		return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } });
	}

	if (pathname === "/api/auth/me" && method === "GET") {
		const user = await getAuthenticatedUser(request, env.superhuman_control);
		return user
			? Response.json({ user }, { headers: { "Cache-Control": "no-store" } })
			: jsonError("Authentication required", 401);
	}

	if (pathname === "/api/admin/me" && method === "GET") {
		const admin = await requireAdmin(request, env.superhuman_control, env.ADMIN_EMAIL);
		return isAuthenticatedUser(admin)
			? Response.json({ user: admin }, { headers: { "Cache-Control": "no-store" } })
			: admin;
	}

	if (pathname.startsWith("/api/admin/")) {
		const admin = await requireAdmin(request, env.superhuman_control, env.ADMIN_EMAIL);
		if (!isAuthenticatedUser(admin)) return admin;
		if (method !== "GET") return jsonError("Method not allowed", 405);
		if (pathname === "/api/admin/dashboard") {
			const [users, accounts, databases, mappings] = await Promise.all([
				env.superhuman_control.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>(),
				env.superhuman_control.prepare("SELECT COUNT(*) AS count FROM cloudflare_accounts").first<{ count: number }>(),
				env.superhuman_control.prepare("SELECT COUNT(*) AS count FROM data_databases").first<{ count: number }>(),
				env.superhuman_control.prepare("SELECT COUNT(*) AS count FROM user_database_mapping").first<{ count: number }>(),
			]);
			return Response.json({ users: users?.count ?? 0, cloudflareAccounts: accounts?.count ?? 0, dataDatabases: databases?.count ?? 0, userMappings: mappings?.count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
		}
		const adminQueries: Record<string, string> = {
			"/api/admin/users": "SELECT id, email, role, status, created_at, updated_at FROM users ORDER BY created_at DESC",
			"/api/admin/cloudflare-accounts": "SELECT id, name, cloudflare_account_id, status, created_at FROM cloudflare_accounts ORDER BY name",
			"/api/admin/data-databases": "SELECT id, cloudflare_account_ref, name, d1_database_id, status, current_size_bytes, user_count, updated_at FROM data_databases ORDER BY name",
			"/api/admin/user-database-mappings": "SELECT m.user_id, u.email, m.data_database_id, d.name AS database_name, m.data_usage_bytes, m.status, m.updated_at FROM user_database_mapping m JOIN users u ON u.id = m.user_id JOIN data_databases d ON d.id = m.data_database_id ORDER BY u.email",
		};
		const query = adminQueries[pathname];
		if (!query) return jsonError("Not found", 404);
		const result = await env.superhuman_control.prepare(query).all();
		return Response.json({ items: result.results }, { headers: { "Cache-Control": "no-store" } });
	}

	// Unknown API routes return 404. Under the local-first architecture,
	// productivity data is stored on-device and not routed through the cloud Worker.
	if (pathname.startsWith("/api/")) {
		const user = await requireUser(request, env.superhuman_control);
		if (!isAuthenticatedUser(user)) return user;
		return jsonError("Not found", 404);
	}
	return jsonError("Not found", 404);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			const response = await route(request, env);
			return withCors(response, request, env);
		} catch (error) {
			console.error("Request failed", error);
			return withCors(jsonError("Internal server error", 500), request, env);
		}
	},
} satisfies ExportedHandler<Env>;
