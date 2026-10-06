# Obsolete Productivity Data Migrations

The migrations in this directory were created for `superhuman-data-1`, which was a cloud-hosted Cloudflare D1 database.

**Status:** Obsolete / Inactive.

The `superhuman-data-1` database has been deleted from Cloudflare and removed from `wrangler.jsonc`.

Under Superhuman's **local-first architecture**:
- All user productivity data (notes, tasks, goals, habits, projects, journals) lives entirely in local storage on the user's devices (e.g. iPhone, Mac).
- Cloudflare D1 is strictly reserved for `superhuman-control` (user accounts, authentication, minimal metadata).
- These SQL files are preserved solely for audit/reference and are **not** applied to any cloud database.
