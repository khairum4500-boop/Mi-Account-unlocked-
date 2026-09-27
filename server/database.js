const path = require('path');
const fs = require('fs');

const isPostgres = Boolean(
    process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://'))
);

let pgPool = null;
let sqliteDb = null;

if (isPostgres) {
    const { Pool } = require('pg');
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
    });
    console.log('[DB] Connecting to PostgreSQL via DATABASE_URL');
} else {
    const sqlite3 = require('sqlite3').verbose();
    const DB_PATH = process.env.DATABASE_FILE || path.join(__dirname, 'mi_unlock.db');
    sqliteDb = new sqlite3.Database(DB_PATH);
    console.log('[DB] Using local SQLite database at', DB_PATH);
    
    // Concurrency optimization for SQLite: WAL mode, busy timeout, cache
    sqliteDb.serialize(() => {
        sqliteDb.run('PRAGMA journal_mode = WAL;');
        sqliteDb.run('PRAGMA busy_timeout = 30000;');
        sqliteDb.run('PRAGMA synchronous = NORMAL;');
        sqliteDb.run('PRAGMA cache_size = -64000;');
        sqliteDb.run('PRAGMA temp_store = MEMORY;');
    });
}

// In-memory cache for high-concurrency read efficiency
const licenseCache = new Map();
const LICENSE_CACHE_TTL_MS = 3000; // 3-second cache for instant microsecond responses

let settingsCache = null;
let settingsCacheExpiry = 0;
const SETTINGS_CACHE_TTL_MS = 15000; // 15-second cache for app configuration

function invalidateLicenseCache(deviceId) {
    if (deviceId) {
        licenseCache.delete(String(deviceId).trim());
    }
}

function invalidateSettingsCache() {
    settingsCache = null;
    settingsCacheExpiry = 0;
}

// Simple mutex queue to serialize SQLite write transactions under heavy load
let sqliteWriteQueue = Promise.resolve();
function queueSqliteWrite(fn) {
    const next = sqliteWriteQueue.then(fn, fn);
    sqliteWriteQueue = next.catch(() => {});
    return next;
}

// Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
function formatQueryForEngine(sql) {
    if (!isPostgres) return sql;
    let paramIndex = 1;
    return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

// Initialize DB Tables & Schema
async function initDb() {
    if (isPostgres) {
        const schemaPath = path.join(__dirname, 'schema_pg.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await pgPool.query(schema);
        await pgPool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS duration_seconds BIGINT`);

        // Seed default settings if empty
        const defaults = [
            ['app_name', 'MI Unlock'],
            ['min_version', '1'],
            ['latest_version', '1'],
            ['update_url', 'https://t.me/itz_khairum'],
            ['maintenance_mode', 'false'],
            ['announcement', ''],
            ['admin_telegram', '@itz_khairum'],
            ['admin_contact', '01577430152'],
            ['admin_whatsapp', '01735047020'],
            ['admin_email', 'siam162536@gmail.com']
        ];

        const now = Date.now();
        for (const [k, v] of defaults) {
            await pgPool.query(
                `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
                [k, v, now]
            );
        }

        console.log('[DB] PostgreSQL schema initialized successfully.');
        return pgPool;
    } else {
        return new Promise((resolve, reject) => {
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            sqliteDb.exec(schema, (err) => {
                if (err) {
                    console.error('[DB] SQLite schema initialization failed:', err);
                    return reject(err);
                }

                // Backward-compatible migration for existing SQLite databases.
                sqliteDb.run('ALTER TABLE licenses ADD COLUMN duration_seconds INTEGER', (migrationErr) => {
                    if (migrationErr && !String(migrationErr.message || '').toLowerCase().includes('duplicate column')) {
                        console.warn('[DB] duration_seconds migration:', migrationErr.message);
                    }

                    const defaults = [
                        ['app_name', 'MI Unlock'],
                        ['min_version', '1'],
                        ['latest_version', '1'],
                        ['update_url', 'https://t.me/itz_khairum'],
                        ['maintenance_mode', 'false'],
                        ['announcement', ''],
                        ['admin_telegram', '@itz_khairum'],
                        ['admin_contact', '01577430152'],
                        ['admin_whatsapp', '01735047020'],
                        ['admin_email', 'siam162536@gmail.com']
                    ];

                    const stmt = sqliteDb.prepare(`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`);
                    const now = Date.now();
                    defaults.forEach(([k, v]) => stmt.run(k, v, now));
                    stmt.finalize(() => {
                        console.log('[DB] SQLite database initialized successfully.');
                        resolve(sqliteDb);
                    });
                });
            });
        });
    }
}

// Promisified query helpers
async function run(sql, params = []) {
    if (isPostgres) {
        let convertedSql = formatQueryForEngine(sql);
        // If it's an insert without returning, add RETURNING id if applicable
        if (convertedSql.trim().toUpperCase().startsWith('INSERT INTO USERS') && !convertedSql.toUpperCase().includes('RETURNING')) {
            convertedSql += ' RETURNING id';
        }
        const res = await pgPool.query(convertedSql, params);
        return {
            lastID: res.rows && res.rows[0] ? res.rows[0].id : null,
            changes: res.rowCount
        };
    } else {
        return queueSqliteWrite(() => new Promise((resolve, reject) => {
            sqliteDb.run(sql, params, function (err) {
                if (err) return reject(err);
                resolve({ lastID: this.lastID, changes: this.changes });
            });
        }));
    }
}

async function get(sql, params = []) {
    if (isPostgres) {
        const convertedSql = formatQueryForEngine(sql);
        const res = await pgPool.query(convertedSql, params);
        return res.rows[0] || null;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.get(sql, params, (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    }
}

async function all(sql, params = []) {
    if (isPostgres) {
        const convertedSql = formatQueryForEngine(sql);
        const res = await pgPool.query(convertedSql, params);
        return res.rows;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.all(sql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
}

// Settings methods
async function getSettings() {
    const now = Date.now();
    if (settingsCache && now < settingsCacheExpiry) {
        return settingsCache;
    }
    const rows = await all(`SELECT key, value FROM settings`);
    const map = {};
    rows.forEach(r => map[r.key] = r.value);
    const res = {
        appName: map['app_name'] || 'MI Unlock',
        minVersion: parseInt(map['min_version'] || '1', 10),
        latestVersion: parseInt(map['latest_version'] || '1', 10),
        updateUrl: map['update_url'] || 'https://t.me/itz_khairum',
        maintenanceMode: map['maintenance_mode'] === 'true',
        announcement: map['announcement'] || '',
        adminTelegram: map['admin_telegram'] || '@itz_khairum',
        adminContact: map['admin_contact'] || '01577430152',
        adminWhatsapp: map['admin_whatsapp'] || '01735047020',
        adminEmail: map['admin_email'] || 'siam162536@gmail.com'
    };
    settingsCache = res;
    settingsCacheExpiry = now + SETTINGS_CACHE_TTL_MS;
    return res;
}

async function updateSetting(key, value) {
    const now = Date.now();
    invalidateSettingsCache();
    if (isPostgres) {
        await run(`
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
        `, [key, String(value), now]);
    } else {
        await run(`
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `, [key, String(value), now]);
    }
}

async function getSingleSetting(key) {
    const row = await get(`SELECT value FROM settings WHERE key = ?`, [key]);
    return row ? row.value : null;
}

// License Retrieval
async function getLicense(deviceId) {
    if (!deviceId) return null;
    const cleanId = String(deviceId).trim();
    const now = Date.now();

    const cached = licenseCache.get(cleanId);
    if (cached && (now - cached.timestamp) < LICENSE_CACHE_TTL_MS) {
        const data = { ...cached.data, serverTime: now };
        if (data.status === 'APPROVED' && !data.isLifetime && data.expirationTimestamp && now >= data.expirationTimestamp) {
            data.status = 'EXPIRED';
        }
        return data;
    }

    const row = await get(`
        SELECT
            l.license_id,
            l.device_id,
            l.status,
            l.duration_days,
            l.duration_seconds,
            l.is_lifetime,
            l.created_at,
            l.approved_at,
            l.activation_at,
            l.expiration_at,
            l.notes,
            l.rejection_reason,
            u.name as user_name,
            u.contact_number,
            u.telegram_username,
            u.whatsapp_number,
            d.model,
            d.brand,
            d.last_seen_at
        FROM licenses l
        LEFT JOIN devices d ON l.device_id = d.device_id
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.device_id = ?
    `, [cleanId]);

    if (!row) return null;

    let currentStatus = row.status;

    // Check expiration dynamically
    if (currentStatus === 'APPROVED' && !row.is_lifetime && row.expiration_at && now >= row.expiration_at) {
        currentStatus = 'EXPIRED';
        await run(`UPDATE licenses SET status = 'EXPIRED' WHERE device_id = ?`, [cleanId]);
        await run(`UPDATE devices SET status = 'EXPIRED' WHERE device_id = ?`, [cleanId]);
    }

    const daysRemaining = (row.expiration_at && row.expiration_at > now)
        ? Math.ceil((row.expiration_at - now) / (1000 * 60 * 60 * 24))
        : 0;

    const result = {
        status: currentStatus,
        deviceId: row.device_id,
        licenseId: row.license_id,
        userName: row.user_name,
        contactNumber: row.contact_number,
        telegramUsername: row.telegram_username,
        whatsappNumber: row.whatsapp_number,
        createdTimestamp: row.created_at,
        approvedTimestamp: row.approved_at,
        activationTimestamp: row.activation_at,
        expirationTimestamp: row.expiration_at,
        lastSeenTimestamp: row.last_seen_at,
        notes: row.notes,
        rejectionReason: row.rejection_reason,
        daysRemaining: daysRemaining,
        durationSeconds: Number(row.duration_seconds || 0),
        isLifetime: Boolean(row.is_lifetime),
        serverTime: now
    };

    licenseCache.set(cleanId, { timestamp: now, data: result });
    return result;
}

async function registerApprovalRequest(data) {
    const now = Date.now();
    const { deviceId, name, contactNumber, telegramUsername, whatsappNumber, appVersion, deviceModel, deviceBrand } = data;
    invalidateLicenseCache(deviceId);

    // 1. Insert or update user
    let user = await get(`SELECT id FROM users WHERE contact_number = ?`, [contactNumber]);
    let userId;
    if (user) {
        userId = user.id;
        await run(`UPDATE users SET name = ?, telegram_username = ?, whatsapp_number = ? WHERE id = ?`,
            [name, telegramUsername, whatsappNumber, userId]);
    } else {
        const uRes = await run(`INSERT INTO users (name, contact_number, telegram_username, whatsapp_number, created_at)
                                VALUES (?, ?, ?, ?, ?)`, [name, contactNumber, telegramUsername, whatsappNumber, now]);
        userId = uRes.lastID;
    }

    // 2. Insert or update device
    await run(`INSERT INTO devices (device_id, user_id, model, brand, app_version, status, last_seen_at, created_at)
               VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
               ON CONFLICT(device_id) DO UPDATE SET
                   user_id = EXCLUDED.user_id,
                   model = EXCLUDED.model,
                   brand = EXCLUDED.brand,
                   app_version = EXCLUDED.app_version,
                   last_seen_at = EXCLUDED.last_seen_at`,
        [deviceId, userId, deviceModel, deviceBrand, appVersion || 1, now, now]);

    // 3. Insert or update license
    const licenseId = `LIC-${deviceId.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8)}`;
    await run(`INSERT INTO licenses (license_id, device_id, user_id, status, created_at)
               VALUES (?, ?, ?, 'PENDING', ?)
               ON CONFLICT(device_id) DO UPDATE SET
                   user_id = EXCLUDED.user_id,
                   status = 'PENDING',
                   rejection_reason = NULL`,
        [licenseId, deviceId, userId, now]);

    // 4. Log approval request
    await run(`INSERT INTO approval_requests (device_id, user_name, contact_number, telegram_username, whatsapp_number, status, created_at)
               VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
        [deviceId, name, contactNumber, telegramUsername, whatsappNumber, now]);

    return getLicense(deviceId);
}

async function approveDeviceDuration(deviceId, durationSeconds, isLifetime = false, adminId = 'SYSTEM') {
    invalidateLicenseCache(deviceId);
    const now = Date.now();
    const seconds = normalizeLicenseDurationSeconds(durationSeconds, isLifetime);
    const expirationAt = isLifetime ? null : now + (seconds * 1000);
    const durationDays = isLifetime ? null : Math.floor(seconds / 86400);

    await run(`UPDATE licenses SET
               status = 'APPROVED',
               duration_days = ?,
               duration_seconds = ?,
               is_lifetime = ?,
               approved_at = ?,
               activation_at = ?,
               expiration_at = ?,
               rejection_reason = NULL
               WHERE device_id = ?`,
        [durationDays, isLifetime ? null : seconds, isLifetime ? 1 : 0, now, now, expirationAt, deviceId]);

    await run(`UPDATE devices SET status = 'APPROVED' WHERE device_id = ?`, [deviceId]);
    await run(`UPDATE approval_requests SET status = 'APPROVED', resolved_at = ?, resolved_by = ? WHERE device_id = ? AND status = 'PENDING'`,
        [now, adminId, deviceId]);

    const detail = isLifetime ? 'Approved for Lifetime' : `Approved for ${formatDurationForLog(seconds)}`;
    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'APPROVE', ?, ?, ?)`, [adminId, deviceId, detail, now]);
    return getLicense(deviceId);
}

async function approveDevice(deviceId, durationDays, isLifetime = false, adminId = 'SYSTEM') {
    return approveDeviceDuration(deviceId, isLifetime ? 0 : (Number(durationDays) || 0) * 86400, isLifetime, adminId);
}

async function rejectDevice(deviceId, reason = 'Application requirements not met', adminId = 'SYSTEM') {
    invalidateLicenseCache(deviceId);
    const now = Date.now();
    await run(`UPDATE licenses SET status = 'REJECTED', rejection_reason = ? WHERE device_id = ?`, [reason, deviceId]);
    await run(`UPDATE devices SET status = 'REJECTED' WHERE device_id = ?`, [deviceId]);
    await run(`UPDATE approval_requests SET status = 'REJECTED', resolved_at = ?, resolved_by = ?, resolution_notes = ? WHERE device_id = ? AND status = 'PENDING'`,
        [now, adminId, reason, deviceId]);
    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'REJECT', ?, ?, ?)`, [adminId, deviceId, `Rejected: ${reason}`, now]);
    return getLicense(deviceId);
}

async function blockDevice(deviceId, adminId = 'SYSTEM') {
    invalidateLicenseCache(deviceId);
    const now = Date.now();
    const existing = await getLicense(deviceId);
    if (!existing) throw new Error('Device not found');
    await run(`UPDATE licenses SET status = 'BLOCKED' WHERE device_id = ?`, [deviceId]);
    await run(`UPDATE devices SET status = 'BLOCKED' WHERE device_id = ?`, [deviceId]);
    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'BLOCK', ?, ?, ?)`, [adminId, deviceId, 'Device blocked; previous license timestamps preserved', now]);
    return getLicense(deviceId);
}

async function unblockDeviceDuration(deviceId, durationSeconds, adminId = 'SYSTEM') {
    invalidateLicenseCache(deviceId);
    const now = Date.now();
    const existing = await getLicense(deviceId);
    if (!existing) throw new Error('Device not found');
    const seconds = normalizeLicenseDurationSeconds(durationSeconds);
    const expirationAt = now + seconds * 1000;
    const durationDays = Math.floor(seconds / 86400);
    await run(`UPDATE licenses SET status = 'APPROVED', duration_days = ?, duration_seconds = ?, is_lifetime = 0,
               activation_at = ?, expiration_at = ?, rejection_reason = NULL WHERE device_id = ?`,
        [durationDays, seconds, now, expirationAt, deviceId]);
    await run(`UPDATE devices SET status = 'APPROVED' WHERE device_id = ?`, [deviceId]);
    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'UNBLOCK', ?, ?, ?)`,
        [adminId, deviceId, `Unblocked with ${formatDurationForLog(seconds)}`, now]);
    return getLicense(deviceId);
}

async function unblockDevice(deviceId, restoreStatus = 'APPROVED', durationDays = 30, adminId = 'SYSTEM') {
    if (restoreStatus === 'APPROVED') return unblockDeviceDuration(deviceId, (Number(durationDays) || 30) * 86400, adminId);
    invalidateLicenseCache(deviceId);
    const now = Date.now();
    await run(`UPDATE licenses SET status = ? WHERE device_id = ?`, [restoreStatus, deviceId]);
    await run(`UPDATE devices SET status = ? WHERE device_id = ?`, [restoreStatus, deviceId]);
    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'UNBLOCK', ?, ?, ?)`, [adminId, deviceId, `Unblocked as ${restoreStatus}`, now]);
    return getLicense(deviceId);
}

async function revokeDevice(deviceId, adminId = 'SYSTEM') {
    invalidateLicenseCache(deviceId);
    const now = Date.now();
    await run(`UPDATE licenses SET status = 'REVOKED', expiration_at = ? WHERE device_id = ?`, [now, deviceId]);
    await run(`UPDATE devices SET status = 'REVOKED' WHERE device_id = ?`, [deviceId]);
    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'REVOKE', ?, 'License revoked by administrator', ?)`, [adminId, deviceId, now]);
    return getLicense(deviceId);
}

async function extendLicenseDuration(deviceId, additionalSeconds, adminId = 'SYSTEM') {
    invalidateLicenseCache(deviceId);
    const lic = await getLicense(deviceId);
    if (!lic) throw new Error('Device not found');
    if (lic.isLifetime) throw new Error('Lifetime licenses do not need extension');
    const seconds = normalizeLicenseDurationSeconds(additionalSeconds);
    const now = Date.now();
    const currentExpiry = (lic.expirationTimestamp && lic.expirationTimestamp > now) ? lic.expirationTimestamp : now;
    const newExpiry = currentExpiry + seconds * 1000;
    const totalSeconds = Math.max(1, Math.floor((newExpiry - (lic.activationTimestamp || now)) / 1000));
    await run(`UPDATE licenses SET status = 'APPROVED', expiration_at = ?, duration_seconds = ?, duration_days = ?, is_lifetime = 0 WHERE device_id = ?`,
        [newExpiry, totalSeconds, Math.floor(totalSeconds / 86400), deviceId]);
    await run(`UPDATE devices SET status = 'APPROVED' WHERE device_id = ?`, [deviceId]);
    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'EXTEND', ?, ?, ?)`,
        [adminId, deviceId, `Extended by ${formatDurationForLog(seconds)}. New expiration: ${new Date(newExpiry).toISOString()}`, now]);
    return getLicense(deviceId);
}

async function extendLicense(deviceId, additionalDays, adminId = 'SYSTEM') {
    return extendLicenseDuration(deviceId, (Number(additionalDays) || 0) * 86400, adminId);
}

const MIN_LICENSE_DURATION_SECONDS = 60;
const MAX_LICENSE_DURATION_SECONDS = 10 * 365 * 24 * 60 * 60;

function normalizeLicenseDurationSeconds(value, allowLifetime = false) {
    const seconds = Math.floor(Number(value));
    if (allowLifetime && seconds === 0) return 0;
    if (!Number.isSafeInteger(seconds) || seconds < MIN_LICENSE_DURATION_SECONDS || seconds > MAX_LICENSE_DURATION_SECONDS) {
        throw new Error(`Duration must be between ${MIN_LICENSE_DURATION_SECONDS} seconds and ${MAX_LICENSE_DURATION_SECONDS} seconds`);
    }
    return seconds;
}

function formatDurationForLog(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    const parts = [];
    if (d) parts.push(`${d}d`); if (h) parts.push(`${h}h`); if (m) parts.push(`${m}m`); if (sec && !parts.length) parts.push(`${sec}s`);
    return parts.join(' ') || '0s';
}

async function recordHeartbeat(deviceId, appVersion) {
    invalidateLicenseCache(deviceId);
    const now = Date.now();
    await run(`UPDATE devices SET last_seen_at = ?, app_version = COALESCE(?, app_version) WHERE device_id = ?`,
        [now, appVersion, deviceId]);
}

async function searchDevices(query) {
    const q = `%${query.trim()}%`;
    return all(`
        SELECT
            l.device_id,
            CASE WHEN l.status = 'APPROVED' AND l.is_lifetime = 0 AND l.expiration_at IS NOT NULL AND l.expiration_at <= ? THEN 'EXPIRED' ELSE l.status END AS status,
            l.expiration_at,
            l.duration_seconds,
            l.is_lifetime,
            u.name as user_name,
            u.contact_number,
            u.telegram_username,
            u.whatsapp_number,
            d.model,
            d.brand
        FROM licenses l
        LEFT JOIN devices d ON l.device_id = d.device_id
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.device_id LIKE ?
           OR u.name LIKE ?
           OR u.contact_number LIKE ?
           OR u.telegram_username LIKE ?
        LIMIT 10
    `, [Date.now(), q, q, q, q]);
}

async function getDevicesByStatus(status, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    let countSql = `SELECT COUNT(*) as count FROM licenses`;
    let querySql = `
        SELECT
            l.device_id,
            CASE WHEN l.status = 'APPROVED' AND l.is_lifetime = 0 AND l.expiration_at IS NOT NULL AND l.expiration_at <= ? THEN 'EXPIRED' ELSE l.status END AS status,
            l.expiration_at,
            l.duration_seconds,
            l.is_lifetime,
            u.name as user_name,
            u.contact_number,
            u.telegram_username,
            u.whatsapp_number,
            d.model
        FROM licenses l
        LEFT JOIN devices d ON l.device_id = d.device_id
        LEFT JOIN users u ON l.user_id = u.id
    `;
    const params = [Date.now()];

    if (status && status !== 'ALL') {
        if (status === 'EXPIRING') {
            const now = Date.now();
            const soon = now + (7 * 24 * 60 * 60 * 1000);
            countSql += ` WHERE status = 'APPROVED' AND is_lifetime = 0 AND expiration_at BETWEEN ? AND ?`;
            querySql += ` WHERE l.status = 'APPROVED' AND l.is_lifetime = 0 AND l.expiration_at BETWEEN ? AND ?`;
            params.push(now, soon);
        } else if (status === 'APPROVED') {
            countSql += ` WHERE status = 'APPROVED' AND (is_lifetime = 1 OR expiration_at IS NULL OR expiration_at > ?)`;
            querySql += ` WHERE l.status = 'APPROVED' AND (l.is_lifetime = 1 OR l.expiration_at IS NULL OR l.expiration_at > ?)`;
            params.push(Date.now());
        } else if (status === 'EXPIRED') {
            countSql += ` WHERE status = 'EXPIRED' OR (status = 'APPROVED' AND is_lifetime = 0 AND expiration_at IS NOT NULL AND expiration_at <= ?)`;
            querySql += ` WHERE l.status = 'EXPIRED' OR (l.status = 'APPROVED' AND l.is_lifetime = 0 AND l.expiration_at IS NOT NULL AND l.expiration_at <= ?)`;
            params.push(Date.now());
        } else {
            countSql += ` WHERE status = ?`;
            querySql += ` WHERE l.status = ?`;
            params.push(status);
        }
    }

    querySql += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;

    const countParams = status === 'EXPIRING' ? [Date.now(), Date.now() + (7 * 24 * 60 * 60 * 1000)] : status === 'APPROVED' ? [Date.now()] : status === 'EXPIRED' ? [Date.now()] : (status && status !== 'ALL' ? [status] : []);
    const totalRes = await get(countSql, countParams);
    const total = totalRes ? (totalRes.count || totalRes['count']) : 0;
    const items = await all(querySql, [...params, limit, offset]);

    return {
        page,
        limit,
        total: parseInt(total, 10),
        totalPages: Math.ceil(total / limit),
        items
    };
}

async function getStatistics() {
    const now = Date.now();
    const stats = await get(`
        SELECT
            COUNT(*) as total_devices,
            COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_devices,
            COUNT(CASE WHEN status = 'APPROVED' AND (is_lifetime = 1 OR expiration_at IS NULL OR expiration_at > ?) THEN 1 END) as approved_devices,
            COUNT(CASE WHEN status = 'EXPIRED' OR (status = 'APPROVED' AND is_lifetime = 0 AND expiration_at IS NOT NULL AND expiration_at <= ?) THEN 1 END) as expired_devices,
            COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) as blocked_devices,
            COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_devices
        FROM licenses
    `, [now, now]);


    const sevenDaysLater = now + (7 * 24 * 60 * 60 * 1000);
    const expiringSoon = await get(`
        SELECT COUNT(*) as count FROM licenses
        WHERE status = 'APPROVED' AND is_lifetime = 0 AND expiration_at BETWEEN ? AND ?
    `, [now, sevenDaysLater]);

    const activeRecently = await get(`
        SELECT COUNT(*) as count FROM devices
        WHERE last_seen_at >= ?
    `, [now - (24 * 60 * 60 * 1000)]);

    return {
        total: parseInt(stats.total_devices || 0, 10),
        pending: parseInt(stats.pending_devices || 0, 10),
        approved: parseInt(stats.approved_devices || 0, 10),
        expired: parseInt(stats.expired_devices || 0, 10),
        blocked: parseInt(stats.blocked_devices || 0, 10),
        rejected: parseInt(stats.rejected_devices || 0, 10),
        expiringSoon: expiringSoon ? parseInt(expiringSoon.count || 0, 10) : 0,
        activeLast24h: activeRecently ? parseInt(activeRecently.count || 0, 10) : 0
    };
}

async function getRecentAuditLogs(limit = 15) {
    return all(`
        SELECT id, admin_id, action_type, target_device_id, details, created_at
        FROM admin_actions
        ORDER BY created_at DESC
        LIMIT ?
    `, [limit]);
}

module.exports = {
    initDb,
    getSettings,
    getSingleSetting,
    updateSetting,
    getLicense,
    registerApprovalRequest,
    approveDevice,
    approveDeviceDuration,
    rejectDevice,
    blockDevice,
    unblockDevice,
    unblockDeviceDuration,
    revokeDevice,
    extendLicense,
    extendLicenseDuration,
    recordHeartbeat,
    searchDevices,
    getDevicesByStatus,
    getStatistics,
    getRecentAuditLogs
};
