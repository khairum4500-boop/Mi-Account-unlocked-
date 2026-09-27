-- MI Unlock Licensing & Device Authorization Database Schema

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    telegram_username TEXT,
    whatsapp_number TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    user_id INTEGER,
    model TEXT,
    brand TEXT,
    app_version INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, EXPIRED, BLOCKED, REVOKED
    last_seen_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS licenses (
    license_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL UNIQUE,
    user_id INTEGER,
    status TEXT NOT NULL DEFAULT 'PENDING',
    duration_days INTEGER, -- Legacy whole-day duration (kept for compatibility)
    duration_seconds INTEGER, -- Exact granted duration in seconds; supports hours/minutes
    is_lifetime INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    approved_at INTEGER,
    activation_at INTEGER,
    expiration_at INTEGER,
    notes TEXT,
    rejection_reason TEXT,
    FOREIGN KEY(device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS approval_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    telegram_username TEXT,
    whatsapp_number TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    resolved_by TEXT,
    resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS admin_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- APPROVE, REJECT, BLOCK, UNBLOCK, EXTEND, CONFIG_CHANGE
    target_device_id TEXT,
    details TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    notification_type TEXT NOT NULL, -- 7_DAYS, 3_DAYS, 1_DAY, EXPIRED
    sent_at INTEGER NOT NULL
);

-- Indexes for high-performance lookups
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_licenses_device_id ON licenses(device_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_expiration ON licenses(expiration_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_device ON approval_requests(device_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_users_contact ON users(contact_number);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_username);
CREATE INDEX IF NOT EXISTS idx_notification_device_type ON notification_logs(device_id, notification_type);
