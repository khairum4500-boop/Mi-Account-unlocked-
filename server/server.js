require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const db = require('./database');
const { bot, launchBot, notifyAdminsNewRequest } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'mi_unlock_super_secret_admin_key_2026';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate Limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests from this IP, please try again later.' }
});

const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 10, // Max 10 requests per hour per IP
    message: { error: 'Too many approval requests. Please wait before trying again.' }
});

app.use('/api/', generalLimiter);
app.use('/api/approval/request', registrationLimiter);

// Admin Auth Middleware
function requireAdminKey(req, res, next) {
    const authHeader = req.headers['x-admin-key'] || req.headers['authorization'];
    if (!authHeader || authHeader.replace('Bearer ', '') !== ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing Admin API Key' });
    }
    next();
}

// ------------------- PUBLIC CLIENT API ENDPOINTS -------------------

// Health checks
app.get('/', (req, res) => {
    res.json({
        service: 'MI Unlock Licensing Server',
        status: 'ONLINE',
        time: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        uptime: process.uptime(),
        time: new Date().toISOString()
    });
});

// App configuration (maintenance mode, update check, admin contact)
app.get('/api/app/config', async (req, res) => {
    try {
        const config = await db.getSettings();
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// License status check
app.get('/api/license/status', async (req, res) => {
    try {
        const deviceId = req.query.deviceId;
        if (!deviceId || typeof deviceId !== 'string') {
            return res.status(400).json({ error: 'Missing deviceId parameter' });
        }

        const license = await db.getLicense(deviceId.trim());
        if (!license) {
            return res.status(404).json({
                status: 'UNREGISTERED',
                deviceId: deviceId,
                message: 'Device not registered. Please submit an approval request.'
            });
        }

        res.json(license);
    } catch (err) {
        console.error('[API] /api/license/status error:', err);
        res.status(500).json({ error: 'Failed to retrieve license status' });
    }
});

// Submit device approval request
app.post('/api/approval/request', async (req, res) => {
    try {
        const { deviceId, name, contactNumber, telegramUsername, whatsappNumber, appVersion, deviceModel, deviceBrand } = req.body;

        if (!deviceId || !name || !contactNumber) {
            return res.status(400).json({ error: 'deviceId, name, and contactNumber are required' });
        }

        const license = await db.registerApprovalRequest({
            deviceId: deviceId.trim(),
            name: name.trim(),
            contactNumber: contactNumber.trim(),
            telegramUsername: (telegramUsername || '').trim(),
            whatsappNumber: (whatsappNumber || '').trim(),
            appVersion: parseInt(appVersion, 10) || 1,
            deviceModel: (deviceModel || '').trim(),
            deviceBrand: (deviceBrand || '').trim()
        });

        // Trigger real-time Telegram notification to admin
        notifyAdminsNewRequest(license).catch(err => {
            console.error('[API] Failed to send Telegram alert:', err.message);
        });

        res.status(200).json(license);
    } catch (err) {
        console.error('[API] /api/approval/request error:', err);
        res.status(500).json({ error: 'Failed to register approval request' });
    }
});

// Periodic heartbeat
app.post('/api/heartbeat', async (req, res) => {
    try {
        const { deviceId, appVersion } = req.body;
        if (deviceId) {
            await db.recordHeartbeat(deviceId.trim(), appVersion);
        }
        res.json({ success: true, message: 'Heartbeat acknowledged' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ------------------- ADMIN API ENDPOINTS (PROTECTED) -------------------

app.get('/api/admin/devices', requireAdminKey, async (req, res) => {
    try {
        const status = req.query.status || 'ALL';
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const data = await db.getDevicesByStatus(status, page, limit);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/device/:id', requireAdminKey, async (req, res) => {
    try {
        const lic = await db.getLicense(req.params.id);
        if (!lic) return res.status(404).json({ error: 'Device not found' });
        res.json(lic);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/approve', requireAdminKey, async (req, res) => {
    try {
        const { deviceId, durationDays, isLifetime, adminId } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
        const updated = await db.approveDevice(deviceId, parseInt(durationDays, 10) || 30, Boolean(isLifetime), adminId || 'API_ADMIN');
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/reject', requireAdminKey, async (req, res) => {
    try {
        const { deviceId, reason, adminId } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
        const updated = await db.rejectDevice(deviceId, reason, adminId || 'API_ADMIN');
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/block', requireAdminKey, async (req, res) => {
    try {
        const { deviceId, adminId } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
        const updated = await db.blockDevice(deviceId, adminId || 'API_ADMIN');
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/unblock', requireAdminKey, async (req, res) => {
    try {
        const { deviceId, durationDays, adminId } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
        const updated = await db.unblockDevice(deviceId, 'APPROVED', parseInt(durationDays, 10) || 30, adminId || 'API_ADMIN');
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/extend', requireAdminKey, async (req, res) => {
    try {
        const { deviceId, days, adminId } = req.body;
        if (!deviceId || !days) return res.status(400).json({ error: 'deviceId and days are required' });
        const updated = await db.extendLicense(deviceId, parseInt(days, 10), adminId || 'API_ADMIN');
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/stats', requireAdminKey, async (req, res) => {
    try {
        const stats = await db.getStatistics();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/config', requireAdminKey, async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || value === undefined) return res.status(400).json({ error: 'key and value required' });
        await db.updateSetting(key, value);
        const updatedConfig = await db.getSettings();
        res.json(updatedConfig);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Periodic background cron check for expiring licenses
cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running hourly expiration verification...');
    try {
        const stats = await db.getStatistics();
        console.log(`[CRON] System status: ${stats.approved} active, ${stats.expiringSoon} expiring soon, ${stats.pending} pending`);
    } catch (e) {
        console.error('[CRON] Expiration check failed:', e);
    }
});

// Server Initialization
async function start() {
    try {
        await db.initDb();
        launchBot();
        app.listen(PORT, () => {
            console.log(`=======================================================`);
            console.log(`🚀 MI Unlock License Server running on port ${PORT}`);
            console.log(`📡 Client API Base URL: http://localhost:${PORT}/api/`);
            console.log(`🤖 Telegram Bot Status: ${bot ? 'ENABLED' : 'DISABLED (no token)'}`);
            console.log(`=======================================================`);
        });
    } catch (err) {
        console.error('Fatal initialization error:', err);
        process.exit(1);
    }
}

start();
