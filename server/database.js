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
                stmt.finalize();

                console.log('[DB] SQLite database initialized successfully.');
                resolve(sqliteDb);
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
        return new Promise((resolve, reject) => {
            sqliteDb.run(sql, params, function (err) {
                if (err) return reject(err);
                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
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
    const rows = await all(`SELECT key, value FROM settings`);
    const map = {};
    rows.forEach(r => map[r.key] = r.value);
    return {
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
}

async function updateSetting(key, value) {
    const now = Date.now();
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

// License Retrieval
async function getLicense(deviceId) {
    const row = await get(`
        SELECT
            l.license_id,
            l.device_id,
            l.status,
            l.duration_days,
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
    `, [deviceId]);

    if (!row) return null;

    const now = Date.now();
    let currentStatus = row.status;

    // Check expiration dynamically
    if (currentStatus === 'APPROVED' && !row.is_lifetime && row.expiration_at && now > row.expiration_at) {
        currentStatus = 'EXPIRED';
        await run(`UPDATE licenses SET status = 'EXPIRED' WHERE device_id = ?`, [deviceId]);
        await run(`UPDATE devices SET status = 'EXPIRED' WHERE device_id = ?`, [deviceId]);
    }

    const daysRemaining = (row.expiration_at && row.expiration_at > now)
        ? Math.ceil((row.expiration_at - now) / (1000 * 60 * 60 * 24))
        : 0;

    return {
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
        isLifetime: Boolean(row.is_lifetime),
        serverTime: now
    };
}

async function registerApprovalRequest(data) {
    const now = Date.now();
    const { deviceId, name, contactNumber, telegramUsername, whatsappNumber, appVersion, deviceModel, deviceBrand } = data;

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

async function approveDevice(deviceId, durationDays, isLifetime = false, adminId = 'SYSTEM') {
    const now = Date.now();
    let expirationAt = null;

    if (!isLifetime && durationDays > 0) {
        expirationAt = now + (durationDays * 24 * 60 * 60 * 1000);
    }

    await run(`UPDATE licenses SET
               status = 'APPROVED',
               duration_days = ?,
               is_lifetime = ?,
               approved_at = ?,
               activation_at = ?,
               expiration_at = ?,
               rejection_reason = NULL
               WHERE device_id = ?`,
        [durationDays, isLifetime ? 1 : 0, now, now, expirationAt, deviceId]);

    await run(`UPDATE devices SET status = 'APPROVED' WHERE device_id = ?`, [deviceId]);
    await run(`UPDATE approval_requests SET status = 'APPROVED', resolved_at = ?, resolved_by = ? WHERE device_id = ? AND status = 'PENDING'`,
        [now, adminId, deviceId]);

    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'APPROVE', ?, ?, ?)`,
        [adminId, deviceId, `Approved for ${isLifetime ? 'Lifetime' : durationDays + ' days'}`, now]);

    return getLicense(deviceId);
}

async function rejectDevice(deviceId, reason = 'Application requirements not met', adminId = 'SYSTEM') {
    const now = Date.now();
    await run(`UPDATE licenses SET status = 'REJECTED', rejection_reason = ? WHERE device_id = ?`, [reason, deviceId]);
    await run(`UPDATE devices SET status = 'REJECTED' WHERE device_id = ?`, [deviceId]);
    await run(`UPDATE approval_requests SET status = 'REJECTED', resolved_at = ?, resolved_by = ?, resolution_notes = ? WHERE device_id = ? AND status = 'PENDING'`,
        [now, adminId, reason, deviceId]);

    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'REJECT', ?, ?, ?)`,
        [adminId, deviceId, `Rejected: ${reason}`, now]);

    return getLicense(deviceId);
}

async function blockDevice(deviceId, adminId = 'SYSTEM') {
    const now = Date.now();
    await run(`UPDATE licenses SET status = 'BLOCKED' WHERE device_id = ?`, [deviceId]);
    await run(`UPDATE devices SET status = 'BLOCKED' WHERE device_id = ?`, [deviceId]);

    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'BLOCK', ?, 'Device blocked', ?)`,
        [adminId, deviceId, now]);

    return getLicense(deviceId);
}

async function unblockDevice(deviceId, restoreStatus = 'APPROVED', durationDays = 30, adminId = 'SYSTEM') {
    const now = Date.now();
    if (restoreStatus === 'APPROVED') {
        const expirationAt = now + (durationDays * 24 * 60 * 60 * 1000);
        await run(`UPDATE licenses SET status = 'APPROVED', duration_days = ?, activation_at = ?, expiration_at = ?, rejection_reason = NULL WHERE device_id = ?`,
            [durationDays, now, expirationAt, deviceId]);
        await run(`UPDATE devices SET status = 'APPROVED' WHERE device_id = ?`, [deviceId]);
    } else {
        await run(`UPDATE licenses SET status = ? WHERE device_id = ?`, [restoreStatus, deviceId]);
        await run(`UPDATE devices SET status = ? WHERE device_id = ?`, [restoreStatus, deviceId]);
    }

    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'UNBLOCK', ?, ?, ?)`,
        [adminId, deviceId, `Unblocked as ${restoreStatus}`, now]);

    return getLicense(deviceId);
}

async function revokeDevice(deviceId, adminId = 'SYSTEM') {
    const now = Date.now();
    await run(`UPDATE licenses SET status = 'REVOKED', expiration_at = ? WHERE device_id = ?`, [now, deviceId]);
    await run(`UPDATE devices SET status = 'REVOKED' WHERE device_id = ?`, [deviceId]);
    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'REVOKE', ?, 'License revoked by administrator', ?)`,
        [adminId, deviceId, now]);
    return getLicense(deviceId);
}

async function extendLicense(deviceId, additionalDays, adminId = 'SYSTEM') {
    const lic = await getLicense(deviceId);
    if (!lic) throw new Error('Device not found');

    const now = Date.now();
    const currentExpiry = (lic.expirationTimestamp && lic.expirationTimestamp > now) ? lic.expirationTimestamp : now;
    const newExpiry = currentExpiry + (additionalDays * 24 * 60 * 60 * 1000);

    await run(`UPDATE licenses SET
               status = 'APPROVED',
               expiration_at = ?,
               is_lifetime = 0
               WHERE device_id = ?`,
        [newExpiry, deviceId]);

    await run(`UPDATE devices SET status = 'APPROVED' WHERE device_id = ?`, [deviceId]);

    await run(`INSERT INTO admin_actions (admin_id, action_type, target_device_id, details, created_at)
               VALUES (?, 'EXTEND', ?, ?, ?)`,
        [adminId, deviceId, `Extended by ${additionalDays} days. New expiration: ${new Date(newExpiry).toISOString()}`, now]);

    return getLicense(deviceId);
}

async function recordHeartbeat(deviceId, appVersion) {
    const now = Date.now();
    await run(`UPDATE devices SET last_seen_at = ?, app_version = COALESCE(?, app_version) WHERE device_id = ?`,
        [now, appVersion, deviceId]);
}

async function searchDevices(query) {
    const q = `%${query.trim()}%`;
    return all(`
        SELECT
            l.device_id,
            l.status,
            l.expiration_at,
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
    `, [q, q, q, q]);
}

async function getDevicesByStatus(status, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    let countSql = `SELECT COUNT(*) as count FROM licenses`;
    let querySql = `
        SELECT
            l.device_id,
            l.status,
            l.expiration_at,
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
    const params = [];

    if (status && status !== 'ALL') {
        countSql += ` WHERE status = ?`;
        querySql += ` WHERE l.status = ?`;
        params.push(status);
    }

    querySql += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;

    const totalRes = await get(countSql, status && status !== 'ALL' ? [status] : []);
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
    const stats = await get(`
        SELECT
            COUNT(*) as total_devices,
            COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_devices,
            COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) as approved_devices,
            COUNT(CASE WHEN status = 'EXPIRED' THEN 1 END) as expired_devices,
            COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) as blocked_devices,
            COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_devices
        FROM licenses
    `);

    const now = Date.now();
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
    updateSetting,
    getLicense,
    registerApprovalRequest,
    approveDevice,
    rejectDevice,
    blockDevice,
    unblockDevice,
    revokeDevice,
    extendLicense,
    recordHeartbeat,
    searchDevices,
    getDevicesByStatus,
    getStatistics,
    getRecentAuditLogs
};
