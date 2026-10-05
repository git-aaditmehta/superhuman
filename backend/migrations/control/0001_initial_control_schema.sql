-- Migration number: 0001 	 2026-10-05T10:09:23.944Z

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cloudflare_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cloudflare_account_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_databases (
    id TEXT PRIMARY KEY,
    cloudflare_account_ref TEXT NOT NULL,
    name TEXT NOT NULL,
    d1_database_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    current_size_bytes INTEGER NOT NULL DEFAULT 0,
    user_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cloudflare_account_ref) REFERENCES cloudflare_accounts(id)
);

CREATE TABLE IF NOT EXISTS user_database_mapping (
    user_id TEXT PRIMARY KEY,
    data_database_id TEXT NOT NULL,
    data_usage_bytes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (data_database_id) REFERENCES data_databases(id)
);

CREATE INDEX IF NOT EXISTS idx_data_databases_status ON data_databases(status);
CREATE INDEX IF NOT EXISTS idx_data_databases_cloudflare_account_ref ON data_databases(cloudflare_account_ref);

