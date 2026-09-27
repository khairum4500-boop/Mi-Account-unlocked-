-- PostgreSQL Schema for MI Unlock Licensing Server (Production Render PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    telegram_username TEXT,
    whatsapp_number TEXT,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    model TEXT,
    brand TEXT,
    app_version INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'PENDING',
    last_seen_at BIGINT,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS licenses (
    license_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL UNIQUE REFERENCES devices(device_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    duration_days INTEGER,
    duration_seconds BIGINT,
    is_lifetime INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL,
    approved_at BIGINT,
    activation_at BIGINT,
    expiration_at BIGINT,
    notes TEXT,
    rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS approval_requests (
    id SERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    telegram_username TEXT,
    whatsapp_number TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at BIGINT NOT NULL,
    resolved_at BIGINT,
    resolved_by TEXT,
    resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS admin_actions (
    id SERIAL PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target_device_id TEXT,
    details TEXT,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_logs (
    id SERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    sent_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_licenses_device_id ON licenses(device_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_expiration ON licenses(expiration_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_device ON approval_requests(device_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_users_contact ON users(contact_number);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_username);
CREATE INDEX IF NOT EXISTS idx_notification_device_type ON notification_logs(device_id, notification_type);
