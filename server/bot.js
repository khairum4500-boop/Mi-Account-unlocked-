const { Telegraf, Markup } = require('telegraf');
const db = require('./database');

const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
if (!botToken) {
    console.warn('[BOT] TELEGRAM_BOT_TOKEN is not defined in environment. Telegram bot will not start.');
}

const bot = botToken ? new Telegraf(botToken) : null;

// Global error handler to prevent bot or Node process from crashing
if (bot) {
    bot.catch(async (err, ctx) => {
        console.error(`[BOT ERROR] Error for update type ${ctx?.updateType}:`, err.message || err);
        try {
            if (ctx?.callbackQuery) await ctx.answerCbQuery('Something went wrong. Please refresh and try again.', { show_alert: true });
            else if (ctx?.chat?.id) await ctx.reply('❌ Something went wrong. Please try again.');
        } catch (_) {}
    });
}

// Helper: Escape HTML special characters to prevent Telegram formatting crashes
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Allowlist of admin Telegram user IDs supplied by ADMIN_TELEGRAM_IDS
async function getAdminIds() {
    const raw = process.env.ADMIN_TELEGRAM_IDS || '';
    const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
    const set = new Set(ids);

    // Only explicitly configured administrators are trusted. Dynamic chat IDs are
    // allowed only when they belong to an already-authorized administrator.
    try {
        const saved = await db.getSingleSetting('registered_admin_chat_ids');
        if (saved) {
            saved.split(',').map(s => s.trim()).filter(Boolean).forEach(id => set.add(id));
        }
    } catch (e) {
        // ignore
    }

    return Array.from(set);
}

// Register an admin chat ID so future approval requests will be sent to them
async function registerAdminChatId(chatId) {
    if (!chatId) return;
    try {
        const idStr = String(chatId).trim();
        const saved = (await db.getSingleSetting('registered_admin_chat_ids')) || '';
        const list = saved.split(',').map(s => s.trim()).filter(Boolean);
        if (!list.includes(idStr)) {
            list.push(idStr);
            await db.updateSetting('registered_admin_chat_ids', list.join(','));
            console.log(`[BOT] Registered new admin chat ID: ${idStr}`);
        }
    } catch (e) {
        console.error('[BOT] Error registering admin chat ID:', e.message);
    }
}

async function isAdmin(ctx) {
    const adminIds = await getAdminIds();
    if (adminIds.length === 0) return false; // Fail closed when no admin allowlist is configured
    const userId = String(ctx.from?.id);
    return adminIds.includes(userId);
}

// Lightweight interaction debounce; device-level locks protect actual mutations.
const userLastActionTime = new Map();
const USER_COOLDOWN_MS = 350;

// Periodic cleanup of rate-limit map to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [userId, lastTime] of userLastActionTime.entries()) {
        if (now - lastTime > 60000) {
            userLastActionTime.delete(userId);
        }
    }
}, 60000);

// Concurrency Locks: Prevent concurrent double-actions on the same device
const activeDeviceLocks = new Set();

async function withDeviceLock(deviceId, operation) {
    const key = String(deviceId || '').trim();
    if (!key) throw new Error('Device ID is required');
    if (activeDeviceLocks.has(key)) throw new Error('This device is already being processed. Please wait a moment.');
    activeDeviceLocks.add(key);
    try { return await operation(); }
    finally { activeDeviceLocks.delete(key); }
}

async function answerAction(ctx, text, options = {}) {
    try { await ctx.answerCbQuery(text, options); } catch (_) {}
}

async function editOrReply(ctx, text, extra = {}) {
    try {
        if (ctx.callbackQuery?.message) return await ctx.editMessageText(text, extra);
    } catch (error) {
        const message = String(error?.description || error?.message || '');
        // Telegram reports this when the message is already up-to-date or no longer editable.
        if (!/message is not modified|message to edit not found|message can't be edited/i.test(message)) {
            console.error('[BOT EDIT ERROR]:', message);
        }
    }
    return ctx.reply(text, extra);
}

// Outbound Message Queue: Smoothly handles thousands of concurrent notifications without Telegram 429 errors
const outboundMessageQueue = [];
let isQueueWorkerRunning = false;

async function processOutboundQueue() {
    if (isQueueWorkerRunning) return;
    isQueueWorkerRunning = true;

    while (outboundMessageQueue.length > 0) {
        const item = outboundMessageQueue.shift();
        try {
            if (bot && bot.telegram) {
                await bot.telegram.sendMessage(item.chatId, item.text, item.extra);
            }
        } catch (err) {
            console.error(`[BOT QUEUE] Send error to ${item.chatId}:`, err.message);
            // Telegram Rate Limit (HTTP 429) Handling
            if (err.response && err.response.error_code === 429) {
                const retryAfterSec = err.response.parameters?.retry_after || 3;
                console.warn(`[BOT QUEUE] Telegram 429 Too Many Requests! Pausing queue for ${retryAfterSec}s`);
                outboundMessageQueue.unshift(item);
                await new Promise(r => setTimeout(r, retryAfterSec * 1000));
            }
        }
        // Delay 100ms between outbound messages (~10 msgs/sec max) for safe, smooth delivery
        await new Promise(r => setTimeout(r, 100));
    }

    isQueueWorkerRunning = false;
}

function enqueueTelegramMessage(chatId, text, extra) {
    if (outboundMessageQueue.length > 2000) {
        outboundMessageQueue.shift(); // Drop oldest message if queue is overloaded
    }
    outboundMessageQueue.push({ chatId, text, extra });
    processOutboundQueue().catch(err => {
        console.error('[BOT QUEUE CRITICAL ERROR]:', err);
        isQueueWorkerRunning = false;
    });
}

// Middleware: Admin verification, auto-registration & 3-second anti-spam cooldown
if (bot) {
    bot.use(async (ctx, next) => {
        try {
            const userId = String(ctx.from?.id || '');
            const now = Date.now();

            // Check 3-Second Cooldown per user
            if (userId) {
                const lastAction = userLastActionTime.get(userId) || 0;
                const elapsed = now - lastAction;
                if (elapsed < USER_COOLDOWN_MS) {
                    const remainingSeconds = Math.ceil((USER_COOLDOWN_MS - elapsed) / 1000);
                    if (ctx.callbackQuery) {
                        try {
                            await ctx.answerCbQuery(`⏳ Please wait a moment before sending another action.`, { show_alert: false });
                        } catch (_) {}
                    }
                    return; // Drop spam interaction safely without crashing
                }
                userLastActionTime.set(userId, now);
            }

            if (!(await isAdmin(ctx))) {
                return ctx.reply('⛔ <b>Unauthorized:</b> You do not have permission to access the MI Unlock Admin Panel.', { parse_mode: 'HTML' });
            }
            // Only an already-authorized administrator may be auto-registered for future alerts.
            if (ctx.chat?.id) {
                await registerAdminChatId(ctx.chat.id);
            }
            return next();
        } catch (err) {
            console.error('[BOT MIDDLEWARE ERROR]:', err);
            return next();
        }
    });
}

// Formatters
const pendingDurationInputs = new Map();
const MAX_CUSTOM_DURATION_SECONDS = 10 * 365 * 24 * 60 * 60;
const MIN_CUSTOM_DURATION_SECONDS = 60;

function parseDurationInput(input) {
    if (input === null || input === undefined) return null;
    let raw = String(input).trim().toLowerCase();
    if (!raw) return null;
    if (/^(lifetime|life|forever|infinity|∞)$/.test(raw)) {
        return { seconds: 0, lifetime: true };
    }

    raw = raw
        .replace(/minutes?|mins?/g, 'm')
        .replace(/hours?|hrs?/g, 'h')
        .replace(/days?/g, 'd')
        .replace(/seconds?|secs?/g, 's')
        .replace(/\s+/g, '');

    const matches = [...raw.matchAll(/(\d+)([dhms])/g)];
    if (!matches.length || matches.map(m => m[0]).join('') !== raw) return null;

    const unitSeconds = { d: 86400, h: 3600, m: 60, s: 1 };
    let total = 0;
    for (const match of matches) {
        total += Number(match[1]) * unitSeconds[match[2]];
        if (!Number.isSafeInteger(total) || total > MAX_CUSTOM_DURATION_SECONDS) return null;
    }
    if (total < MIN_CUSTOM_DURATION_SECONDS) return null;
    return { seconds: total, lifetime: false };
}

function formatDuration(seconds, lifetime = false) {
    if (lifetime) return '♾️ Lifetime';
    let remaining = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(remaining / 86400); remaining %= 86400;
    const hours = Math.floor(remaining / 3600); remaining %= 3600;
    const minutes = Math.floor(remaining / 60); const secs = remaining % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (secs || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
}

function requestCustomDuration(ctx, deviceId, mode) {
    const userId = String(ctx.from?.id || '');
    if (!userId) return ctx.reply('Unable to identify administrator.');
    pendingDurationInputs.set(userId, { deviceId, mode, createdAt: Date.now() });
    return ctx.reply(
        `✏️ <b>Custom Duration</b>\n\nSend a duration such as <code>45m</code>, <code>2h</code>, <code>2h30m</code>, <code>3d</code>, or <code>2d 4h</code>.\nMinimum: 1 minute. Maximum: 10 years.\nSend <code>cancel</code> to cancel.`,
        { parse_mode: 'HTML' }
    );
}

setInterval(() => {
    const cutoff = Date.now() - (10 * 60 * 1000);
    for (const [userId, pending] of pendingDurationInputs.entries()) {
        if (pending.createdAt < cutoff) pendingDurationInputs.delete(userId);
    }
}, 60 * 1000);

function formatTimestamp(ts) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
}

function formatDeviceCard(d) {
    const status = d.status || 'PENDING';
    const statusEmoji = {
        'APPROVED': '🟢 APPROVED',
        'PENDING': '🟡 PENDING',
        'REJECTED': '🔴 REJECTED',
        'EXPIRED': '🔴 EXPIRED',
        'BLOCKED': '🚫 BLOCKED'
    }[status] || status;

    const deviceId = escapeHtml(d.device_id || d.deviceId || 'N/A');
    const licenseId = escapeHtml(d.license_id || d.licenseId || 'N/A');
    const userName = escapeHtml(d.user_name || d.userName || 'N/A');
    const contact = escapeHtml(d.contact_number || d.contactNumber || 'N/A');
    const tg = escapeHtml(d.telegram_username || d.telegramUsername || 'N/A');
    const wa = escapeHtml(d.whatsapp_number || d.whatsappNumber || 'N/A');
    const model = escapeHtml(`${d.brand || ''} ${d.model || ''}`.trim() || 'N/A');
    const expText = d.is_lifetime ? '♾️ Lifetime' : escapeHtml(formatTimestamp(d.expiration_at || d.expirationTimestamp));
    const lastSeen = escapeHtml(formatTimestamp(d.last_seen_at || d.lastSeenTimestamp));

    return `📱 <b>Device ID:</b> <code>${deviceId}</code>\n` +
           `🔑 <b>License ID:</b> <code>${licenseId}</code>\n` +
           `👤 <b>Name:</b> ${userName}\n` +
           `📞 <b>Contact:</b> <code>${contact}</code>\n` +
           `✈️ <b>Telegram:</b> ${tg}\n` +
           `💬 <b>WhatsApp:</b> <code>${wa}</code>\n` +
           `📊 <b>Status:</b> <b>${statusEmoji}</b>\n` +
           `⏱️ <b>Duration:</b> ${escapeHtml(formatDuration(d.duration_seconds || d.durationSeconds || ((d.duration_days || 0) * 86400), d.is_lifetime))}\n` +
           `⏰ <b>Expires:</b> ${expText}\n` +
           `👁️ <b>Last Seen:</b> ${lastSeen}\n` +
           `📱 <b>Model:</b> ${model}`;
}

// Main Admin Keyboard
function getMainMenu() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Search Device', 'menu_search'), Markup.button.callback('📋 Pending Requests', 'list_PENDING_1')],
        [Markup.button.callback('✅ Approved Devices', 'list_APPROVED_1'), Markup.button.callback('⏳ Expiring Soon', 'list_EXPIRING_1')],
        [Markup.button.callback('❌ Rejected', 'list_REJECTED_1'), Markup.button.callback('🚫 Blocked', 'list_BLOCKED_1')],
        [Markup.button.callback('📱 All Devices', 'list_ALL_1'), Markup.button.callback('📊 Statistics', 'menu_stats')],
        [Markup.button.callback('📜 Audit Logs', 'menu_audit')]
    ]);
}

// Device Actions Keyboard
function getDeviceActionKeyboard(deviceId, currentStatus) {
    const rows = [];
    if (currentStatus === 'PENDING' || currentStatus === 'REJECTED' || currentStatus === 'EXPIRED' || currentStatus === 'REVOKED') {
        rows.push([
            Markup.button.callback('✅ Approve', `dur_${deviceId}`),
            Markup.button.callback('❌ Reject', `rej_${deviceId}`)
        ]);
    } else if (currentStatus === 'APPROVED') {
        rows.push([
            Markup.button.callback('⏳ Extend License', `ext_${deviceId}`),
            Markup.button.callback('🛑 Revoke', `rev_${deviceId}`)
        ]);
        rows.push([
            Markup.button.callback('🚫 Block Device', `blk_${deviceId}`)
        ]);
    } else if (currentStatus === 'BLOCKED') {
        rows.push([
            Markup.button.callback('🔓 Unblock Device', `unblk_${deviceId}`)
        ]);
    }

    rows.push([
        Markup.button.callback('🔄 Refresh', `view_${deviceId}`),
        Markup.button.callback('🔙 Back to Menu', 'menu_home')
    ]);

    return Markup.inlineKeyboard(rows);
}

// Duration selection uses exact seconds so hours/minutes are first-class.
function getDurationKeyboard(deviceId) {
    return Markup.inlineKeyboard([
        [Markup.button.callback('30 Min', `apv_${deviceId}_1800`), Markup.button.callback('1 Hour', `apv_${deviceId}_3600`)],
        [Markup.button.callback('2 Hours', `apv_${deviceId}_7200`), Markup.button.callback('3 Hours', `apv_${deviceId}_10800`)],
        [Markup.button.callback('6 Hours', `apv_${deviceId}_21600`), Markup.button.callback('12 Hours', `apv_${deviceId}_43200`)],
        [Markup.button.callback('1 Day', `apv_${deviceId}_86400`), Markup.button.callback('3 Days', `apv_${deviceId}_259200`)],
        [Markup.button.callback('7 Days', `apv_${deviceId}_604800`), Markup.button.callback('15 Days', `apv_${deviceId}_1296000`)],
        [Markup.button.callback('30 Days', `apv_${deviceId}_2592000`), Markup.button.callback('60 Days', `apv_${deviceId}_5184000`)],
        [Markup.button.callback('90 Days', `apv_${deviceId}_7776000`), Markup.button.callback('180 Days', `apv_${deviceId}_15552000`)],
        [Markup.button.callback('365 Days', `apv_${deviceId}_31536000`), Markup.button.callback('♾️ Lifetime', `apv_${deviceId}_lifetime`)],
        [Markup.button.callback('✏️ Custom Duration', `customapv_${deviceId}`)],
        [Markup.button.callback('🔙 Cancel', `view_${deviceId}`)]
    ]);
}

function getExtensionKeyboard(deviceId) {
    return Markup.inlineKeyboard([
        [Markup.button.callback('+30 Min', `doext_${deviceId}_1800`), Markup.button.callback('+1 Hour', `doext_${deviceId}_3600`)],
        [Markup.button.callback('+2 Hours', `doext_${deviceId}_7200`), Markup.button.callback('+3 Hours', `doext_${deviceId}_10800`)],
        [Markup.button.callback('+6 Hours', `doext_${deviceId}_21600`), Markup.button.callback('+12 Hours', `doext_${deviceId}_43200`)],
        [Markup.button.callback('+1 Day', `doext_${deviceId}_86400`), Markup.button.callback('+3 Days', `doext_${deviceId}_259200`)],
        [Markup.button.callback('+7 Days', `doext_${deviceId}_604800`), Markup.button.callback('+15 Days', `doext_${deviceId}_1296000`)],
        [Markup.button.callback('+30 Days', `doext_${deviceId}_2592000`), Markup.button.callback('+60 Days', `doext_${deviceId}_5184000`)],
        [Markup.button.callback('+90 Days', `doext_${deviceId}_7776000`), Markup.button.callback('+180 Days', `doext_${deviceId}_15552000`)],
        [Markup.button.callback('+365 Days', `doext_${deviceId}_31536000`)],
        [Markup.button.callback('✏️ Custom Duration', `customext_${deviceId}`)],
        [Markup.button.callback('🔙 Cancel', `view_${deviceId}`)]
    ]);
}

function getUnblockKeyboard(deviceId) {
    return Markup.inlineKeyboard([
        [Markup.button.callback('30 Min', `dounblk_${deviceId}_1800`), Markup.button.callback('1 Hour', `dounblk_${deviceId}_3600`)],
        [Markup.button.callback('2 Hours', `dounblk_${deviceId}_7200`), Markup.button.callback('3 Hours', `dounblk_${deviceId}_10800`)],
        [Markup.button.callback('6 Hours', `dounblk_${deviceId}_21600`), Markup.button.callback('12 Hours', `dounblk_${deviceId}_43200`)],
        [Markup.button.callback('1 Day', `dounblk_${deviceId}_86400`), Markup.button.callback('3 Days', `dounblk_${deviceId}_259200`)],
        [Markup.button.callback('7 Days', `dounblk_${deviceId}_604800`), Markup.button.callback('15 Days', `dounblk_${deviceId}_1296000`)],
        [Markup.button.callback('30 Days', `dounblk_${deviceId}_2592000`), Markup.button.callback('60 Days', `dounblk_${deviceId}_5184000`)],
        [Markup.button.callback('90 Days', `dounblk_${deviceId}_7776000`), Markup.button.callback('180 Days', `dounblk_${deviceId}_15552000`)],
        [Markup.button.callback('365 Days', `dounblk_${deviceId}_31536000`), Markup.button.callback('♾️ Lifetime', `dounblk_${deviceId}_lifetime`)],
        [Markup.button.callback('✏️ Custom Duration', `customunblk_${deviceId}`)],
        [Markup.button.callback('🔙 Cancel', `view_${deviceId}`)]
    ]);
}

// Setup Bot Handlers
if (bot) {
    bot.start(async (ctx) => {
        try {
            const stats = await db.getStatistics();
            const welcome = `🛡️ <b>MI UNLOCK ADMIN PANEL</b>\n\n` +
                            `Welcome, <b>${escapeHtml(ctx.from.first_name || 'Admin')}</b>!\n` +
                            `Your Chat ID: <code>${ctx.chat.id}</code> (Saved for alerts)\n\n` +
                            `Pending Approvals: <b>${stats.pending}</b>\n` +
                            `Active Licenses: <b>${stats.approved}</b>\n\n` +
                            `Use the buttons below to manage devices and licenses:`;
            return ctx.replyWithHTML(welcome, getMainMenu());
        } catch (e) {
            console.error('[BOT /start error]:', e);
        }
    });

    bot.command('search', async (ctx) => {
        try {
            const query = ctx.message.text.replace('/search', '').trim();
            if (!query) {
                return ctx.reply('Usage: <code>/search &lt;device_id | phone | telegram | name&gt;</code>', { parse_mode: 'HTML' });
            }

            const results = await db.searchDevices(query);
            if (results.length === 0) {
                return ctx.reply(`🔍 No devices found matching: "${escapeHtml(query)}"`);
            }

            for (const item of results.slice(0, 5)) {
                await ctx.replyWithHTML(formatDeviceCard(item), getDeviceActionKeyboard(item.device_id, item.status));
            }
        } catch (e) {
            console.error('[BOT /search error]:', e);
        }
    });

    bot.action('menu_home', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            return ctx.editMessageText('🛡️ <b>MI UNLOCK ADMIN PANEL</b>\n\nSelect an option:', {
                parse_mode: 'HTML',
                ...getMainMenu()
            });
        } catch (e) {
            console.error('[BOT menu_home error]:', e);
        }
    });

    bot.action('menu_stats', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const stats = await db.getStatistics();
            const text = `📊 <b>MI UNLOCK SYSTEM STATISTICS</b>\n\n` +
                         `📱 Total Devices: <b>${stats.total}</b>\n` +
                         `🟡 Pending Approvals: <b>${stats.pending}</b>\n` +
                         `🟢 Active Licenses: <b>${stats.approved}</b>\n` +
                         `⏳ Expiring in 7 Days: <b>${stats.expiringSoon}</b>\n` +
                         `🔴 Expired Devices: <b>${stats.expired}</b>\n` +
                         `🚫 Blocked Devices: <b>${stats.blocked}</b>\n` +
                         `❌ Rejected Requests: <b>${stats.rejected}</b>\n` +
                         `👁️ Active in last 24h: <b>${stats.activeLast24h}</b>`;
            return ctx.editMessageText(text, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Menu', 'menu_home')]])
            });
        } catch (e) {
            console.error('[BOT menu_stats error]:', e);
        }
    });

    bot.action('menu_audit', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const logs = await db.getRecentAuditLogs(10);
            let text = `📜 <b>RECENT ADMIN AUDIT LOGS</b>\n\n`;
            if (logs.length === 0) {
                text += `No audit logs recorded yet.`;
            } else {
                logs.forEach(l => {
                    text += `• <code>${formatTimestamp(l.created_at)}</code> [${escapeHtml(l.action_type)}] Device: <code>${escapeHtml(l.target_device_id || 'N/A')}</code>\n  <i>${escapeHtml(l.details)}</i>\n\n`;
                });
            }
            return ctx.editMessageText(text, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Menu', 'menu_home')]])
            });
        } catch (e) {
            console.error('[BOT menu_audit error]:', e);
        }
    });

    bot.action('menu_search', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            return ctx.reply('Send <code>/search &lt;query&gt;</code> to find any device by Device ID, phone number, name, or Telegram handle.', { parse_mode: 'HTML' });
        } catch (e) {
            console.error('[BOT menu_search error]:', e);
        }
    });

    // Device listing with pagination: list_<STATUS>_<PAGE>
    bot.action(/list_(ALL|PENDING|APPROVED|REJECTED|BLOCKED|EXPIRING)_(\d+)/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const status = ctx.match[1];
            const page = parseInt(ctx.match[2], 10);

            const data = await db.getDevicesByStatus(status, page, 5);
            if (data.items.length === 0) {
                return ctx.editMessageText(`No devices found in category: <b>${status}</b>`, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Menu', 'menu_home')]])
                });
            }

            let message = `📋 <b>DEVICE LIST (${status})</b> - Page ${data.page}/${data.totalPages || 1}\n\n`;
            const buttons = [];

            data.items.forEach((item, idx) => {
                const num = (page - 1) * 5 + idx + 1;
                message += `${num}. <code>${escapeHtml(item.device_id)}</code> (${escapeHtml(item.user_name || 'N/A')}) - ${item.status}\n`;
                buttons.push([Markup.button.callback(`View #${num} (${item.device_id.slice(-6)})`, `view_${item.device_id}`)]);
            });

            // Pagination buttons
            const navRow = [];
            if (page > 1) {
                navRow.push(Markup.button.callback('⬅️ Previous', `list_${status}_${page - 1}`));
            }
            if (page < data.totalPages) {
                navRow.push(Markup.button.callback('Next ➡️', `list_${status}_${page + 1}`));
            }
            if (navRow.length > 0) buttons.push(navRow);
            buttons.push([Markup.button.callback('🔙 Back to Menu', 'menu_home')]);

            return ctx.editMessageText(message, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard(buttons)
            });
        } catch (e) {
            console.error('[BOT list error]:', e);
        }
    });

    // View specific device details
    bot.action(/view_(.+)/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const deviceId = ctx.match[1];
            const lic = await db.getLicense(deviceId);
            if (!lic) return ctx.reply(`Device ${escapeHtml(deviceId)} not found.`, { parse_mode: 'HTML' });

            return ctx.editMessageText(formatDeviceCard(lic), {
                parse_mode: 'HTML',
                ...getDeviceActionKeyboard(deviceId, lic.status)
            });
        } catch (e) {
            console.error('[BOT view error]:', e);
        }
    });

    // Duration picker
    bot.action(/dur_(.+)/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const deviceId = ctx.match[1];
            return ctx.editMessageText(`⏱️ Select License Duration for device <code>${escapeHtml(deviceId)}</code>:`, {
                parse_mode: 'HTML',
                ...getDurationKeyboard(deviceId)
            });
        } catch (e) {
            console.error('[BOT dur picker error]:', e);
        }
    });

    // Approve action: apv_<deviceId>_<duration>
    bot.action(/apv_(.+)_(lifetime|\d+)/, async (ctx) => {
        const deviceId = ctx.match[1];
        if (activeDeviceLocks.has(deviceId)) {
            try { await ctx.answerCbQuery('⏳ Processing already underway, please wait...'); } catch (_) {}
            return;
        }
        activeDeviceLocks.add(deviceId);
        try {
            await ctx.answerCbQuery('Processing approval...');
            const durStr = ctx.match[2];
            const isLifetime = durStr === 'lifetime';
            const durationSeconds = isLifetime ? 0 : parseInt(durStr, 10);
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');

            const updated = await db.approveDeviceDuration(deviceId, durationSeconds, isLifetime, adminId);
            return ctx.editMessageText(`✅ <b>DEVICE APPROVED SUCCESSFULLY!</b>\n\n${formatDeviceCard(updated)}`, {
                parse_mode: 'HTML',
                ...getDeviceActionKeyboard(deviceId, updated.status)
            });
        } catch (e) {
            console.error('[BOT approve error]:', e);
            try {
                await ctx.reply(`❌ Approval Error: ${escapeHtml(e.message)}`, { parse_mode: 'HTML' });
            } catch (_) {}
        } finally {
            activeDeviceLocks.delete(deviceId);
        }
    });

    // Reject action
    bot.action(/rej_(.+)/, async (ctx) => {
        const deviceId = ctx.match[1];
        if (activeDeviceLocks.has(deviceId)) {
            try { await ctx.answerCbQuery('⏳ Processing already underway, please wait...'); } catch (_) {}
            return;
        }
        activeDeviceLocks.add(deviceId);
        try {
            await ctx.answerCbQuery('Processing rejection...');
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await db.rejectDevice(deviceId, 'Admin rejected request', adminId);
            return ctx.editMessageText(`❌ <b>REQUEST REJECTED</b>\n\n${formatDeviceCard(updated)}`, {
                parse_mode: 'HTML',
                ...getDeviceActionKeyboard(deviceId, updated.status)
            });
        } catch (e) {
            console.error('[BOT reject error]:', e);
        } finally {
            activeDeviceLocks.delete(deviceId);
        }
    });

    // Revoke action
    bot.action(/rev_(.+)/, async (ctx) => {
        const deviceId = ctx.match[1];
        try {
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await withDeviceLock(deviceId, () => db.revokeDevice(deviceId, adminId));
            await answerAction(ctx, 'License revoked.');
            return editOrReply(ctx, `🛑 <b>LICENSE REVOKED</b>\n\n${formatDeviceCard(updated)}`, {
                parse_mode: 'HTML',
                ...getDeviceActionKeyboard(deviceId, updated.status)
            });
        } catch (e) {
            console.error('[BOT revoke error]:', e);
            await answerAction(ctx, 'Revoke failed.');
            return editOrReply(ctx, `❌ <b>Revoke failed</b>\n<code>${escapeHtml(e.message)}</code>`, { parse_mode:'HTML' });
        }
    });

    // Custom Approve Command: /approve <deviceId> <duration>, e.g. 2h30m
    bot.command('approve', async (ctx) => {
        try {
            const parts = ctx.message.text.trim().split(/\s+/);
            if (parts.length < 3) {
                return ctx.reply('Usage: <code>/approve &lt;device_id&gt; &lt;duration&gt;</code>\nExample: <code>/approve MI-XXXXXXXX 2h30m</code> or <code>/approve MI-XXXXXXXX lifetime</code>', { parse_mode: 'HTML' });
            }
            const deviceId = parts[1].trim();
            const parsed = parseDurationInput(parts.slice(2).join(' '));
            if (!parsed) return ctx.reply('Invalid duration. Examples: <code>1h</code>, <code>2h30m</code>, <code>90m</code>, <code>2d</code>, <code>lifetime</code>.', { parse_mode: 'HTML' });
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await db.approveDeviceDuration(deviceId, parsed.seconds, parsed.lifetime, adminId);
            return ctx.replyWithHTML(`✅ <b>DEVICE APPROVED</b>\nDuration: <b>${escapeHtml(formatDuration(parsed.seconds, parsed.lifetime))}</b>\n\n${formatDeviceCard(updated)}`, getDeviceActionKeyboard(deviceId, updated.status));
        } catch (e) {
            console.error('[BOT cmd approve error]:', e);
            return ctx.reply(`Error: ${escapeHtml(e.message)}`);
        }
    });

    // Block action
    bot.action(/blk_(.+)/, async (ctx) => {
        const deviceId = ctx.match[1];
        try {
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await withDeviceLock(deviceId, () => db.blockDevice(deviceId, adminId));
            await answerAction(ctx, 'Device blocked successfully.');
            return editOrReply(ctx, `🚫 <b>DEVICE BLOCKED</b>\n\n${formatDeviceCard(updated)}`, {
                parse_mode: 'HTML',
                ...getDeviceActionKeyboard(deviceId, updated.status)
            });
        } catch (e) {
            console.error('[BOT block error]:', e);
            await answerAction(ctx, 'Block failed.');
            return editOrReply(ctx, `❌ <b>Block failed</b>\n<code>${escapeHtml(e.message)}</code>`, { parse_mode: 'HTML', ...getDeviceActionKeyboard(deviceId, 'APPROVED') });
        }
    });

    // Unblock opens a duration picker instead of silently granting a fixed 30 days.
    bot.action(/unblk_(.+)/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const deviceId = ctx.match[1];
            return ctx.editMessageText(`🔓 <b>Unblock Device</b>\n\nSelect how long access should be restored for <code>${escapeHtml(deviceId)}</code>:`, {
                parse_mode: 'HTML', ...getUnblockKeyboard(deviceId)
            });
        } catch (e) { console.error('[BOT unblock picker error]:', e); }
    });

    bot.action(/dounblk_(.+)_lifetime/, async (ctx) => {
        const deviceId = ctx.match[1];
        try {
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await withDeviceLock(deviceId, () => db.unblockDeviceDuration(deviceId, 0, true, adminId));
            await answerAction(ctx, 'Device unblocked successfully.');
            return editOrReply(ctx, `🔓 <b>DEVICE UNBLOCKED</b>\nDuration: <b>♾️ Lifetime</b>\n\n${formatDeviceCard(updated)}`, { parse_mode: 'HTML', ...getDeviceActionKeyboard(deviceId, updated.status) });
        } catch (e) { console.error('[BOT unblock lifetime error]:', e); await answerAction(ctx, 'Unblock failed.'); return editOrReply(ctx, `❌ <b>Unblock failed</b>\n<code>${escapeHtml(e.message)}</code>`, { parse_mode:'HTML', ...getDeviceActionKeyboard(deviceId, 'BLOCKED') }); }
    });

    bot.action(/dounblk_(.+)_(\d+)/, async (ctx) => {
        const deviceId = ctx.match[1];
        try {
            const seconds = parseInt(ctx.match[2], 10);
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await withDeviceLock(deviceId, () => db.unblockDeviceDuration(deviceId, seconds, false, adminId));
            await answerAction(ctx, 'Device unblocked successfully.');
            return editOrReply(ctx, `🔓 <b>DEVICE UNBLOCKED</b>\nDuration: <b>${formatDuration(seconds)}</b>\n\n${formatDeviceCard(updated)}`, { parse_mode: 'HTML', ...getDeviceActionKeyboard(deviceId, updated.status) });
        } catch (e) { console.error('[BOT unblock error]:', e); await answerAction(ctx, 'Unblock failed.'); return editOrReply(ctx, `❌ <b>Unblock failed</b>\n<code>${escapeHtml(e.message)}</code>`, { parse_mode:'HTML', ...getDeviceActionKeyboard(deviceId, 'BLOCKED') }); }
    });

    bot.action(/customunblk_(.+)/, async (ctx) => {
        try { await ctx.answerCbQuery(); return requestCustomDuration(ctx, ctx.match[1], 'unblock'); }
        catch (e) { console.error('[BOT custom unblock prompt error]:', e); }
    });

    bot.action(/customapv_(.+)/, async (ctx) => {
        try { await ctx.answerCbQuery(); return requestCustomDuration(ctx, ctx.match[1], 'approve'); }
        catch (e) { console.error('[BOT custom approve prompt error]:', e); }
    });

    bot.action(/customext_(.+)/, async (ctx) => {
        try { await ctx.answerCbQuery(); return requestCustomDuration(ctx, ctx.match[1], 'extend'); }
        catch (e) { console.error('[BOT custom extend prompt error]:', e); }
    });

    // Extension options
    bot.action(/ext_(.+)/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const deviceId = ctx.match[1];
            return ctx.editMessageText(`⏳ Select Extension Period for device <code>${escapeHtml(deviceId)}</code>:`, {
                parse_mode: 'HTML',
                ...getExtensionKeyboard(deviceId)
            });
        } catch (e) {
            console.error('[BOT ext error]:', e);
        }
    });

    // Execute extension
    bot.action(/doext_(.+)_(\d+)/, async (ctx) => {
        const deviceId = ctx.match[1];
        try {
            const seconds = parseInt(ctx.match[2], 10);
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await withDeviceLock(deviceId, () => db.extendLicenseDuration(deviceId, seconds, adminId));
            await answerAction(ctx, 'License extended successfully.');
            return editOrReply(ctx, `🎉 <b>LICENSE EXTENDED BY +${formatDuration(seconds)}!</b>\n\n${formatDeviceCard(updated)}`, {
                parse_mode: 'HTML',
                ...getDeviceActionKeyboard(deviceId, updated.status)
            });
        } catch (e) {
            console.error('[BOT doext error]:', e);
            await answerAction(ctx, 'Extension failed.');
            return editOrReply(ctx, `❌ <b>Extension failed</b>\n<code>${escapeHtml(e.message)}</code>`, { parse_mode:'HTML', ...getDeviceActionKeyboard(deviceId, 'APPROVED') });
        }
    });

    // Resolve custom duration entered by the admin after a custom-duration prompt.
    bot.on('text', async (ctx) => {
        const key = String(ctx.from?.id || '');
        const pending = pendingDurationInputs.get(key);
        if (!pending) return;
        pendingDurationInputs.delete(key);
        if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
            return ctx.reply('⌛ Custom duration request expired. Please open the duration menu again.');
        }
        if (String(ctx.message.text || '').trim().toLowerCase() === 'cancel') {
            return ctx.reply('❎ Cancelled.');
        }
        const parsed = parseDurationInput(ctx.message.text);
        if (!parsed || (parsed.lifetime && pending.mode === 'extend')) {
            return ctx.reply('❌ Invalid duration. Try <code>1h</code>, <code>2h30m</code>, <code>90m</code>, <code>2d</code>, or <code>lifetime</code> for approval/unblock.', {parse_mode:'HTML'});
        }
        const deviceId = pending.deviceId;
        const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
        try {
            let updated;
            if (pending.mode === 'approve') updated = await withDeviceLock(deviceId, () => db.approveDeviceDuration(deviceId, parsed.seconds, parsed.lifetime, adminId));
            else if (pending.mode === 'extend') updated = await withDeviceLock(deviceId, () => db.extendLicenseDuration(deviceId, parsed.seconds, adminId));
            else updated = await withDeviceLock(deviceId, () => db.unblockDeviceDuration(deviceId, parsed.seconds, parsed.lifetime, adminId));
            const verb = pending.mode === 'approve' ? 'APPROVED' : pending.mode === 'extend' ? 'EXTENDED' : 'UNBLOCKED';
            return ctx.replyWithHTML(`✅ <b>${verb}</b>\nDuration: <b>${formatDuration(parsed.seconds, parsed.lifetime)}</b>\n\n${formatDeviceCard(updated)}`, getDeviceActionKeyboard(deviceId, updated.status));
        } catch (e) {
            console.error('[BOT custom duration error]:', e);
            return ctx.reply(`❌ ${escapeHtml(e.message)}`, {parse_mode:'HTML'});
        }
    });

}

// Function to broadcast new approval request to all configured admins
async function notifyAdminsNewRequest(requestData) {
    if (!bot) {
        console.warn('[BOT] Cannot notify admins: Telegram bot instance is not initialized.');
        return;
    }
    const adminIds = await getAdminIds();
    console.log(`[BOT] Sending approval notification to admin IDs: [${adminIds.join(', ')}]`);
    if (adminIds.length === 0) {
        console.warn('[BOT] No admin IDs registered to receive approval notification.');
        return;
    }

    const message = `🔔 <b>NEW APPROVAL REQUEST</b>\n\n` +
                    formatDeviceCard(requestData);

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('✅ APPROVE', `dur_${requestData.deviceId}`),
            Markup.button.callback('❌ REJECT', `rej_${requestData.deviceId}`)
        ],
        [Markup.button.callback('🔍 VIEW DEVICE', `view_${requestData.deviceId}`)]
    ]);

    for (const adminId of adminIds) {
        try {
            enqueueTelegramMessage(adminId, message, {
                parse_mode: 'HTML',
                ...keyboard
            });
            console.log(`[BOT QUEUE] Enqueued approval notification for ${adminId}`);
        } catch (e) {
            console.error(`[BOT] Failed to enqueue notification for admin ${adminId}:`, e.message);
        }
    }
}

function launchBot() {
    if (bot) {
        bot.launch().then(() => {
            console.log('[BOT] Telegram Admin Bot polling launched successfully.');
        }).catch(err => {
            console.error('[BOT] Bot launch error:', err.message);
        });

        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
    }
}

module.exports = {
    bot,
    launchBot,
    notifyAdminsNewRequest
};
