const { Telegraf, Markup } = require('telegraf');
const db = require('./database');

const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
if (!botToken) {
    console.warn('[BOT] TELEGRAM_BOT_TOKEN is not defined in environment. Telegram bot will not start.');
}

const bot = botToken ? new Telegraf(botToken) : null;

// Global error handler to prevent bot or Node process from crashing
if (bot) {
    bot.catch((err, ctx) => {
        console.error(`[BOT ERROR] Error for update type ${ctx?.updateType}:`, err.message || err);
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

// Allowlist of admin Telegram user IDs (e.g. "7585875519")
async function getAdminIds() {
    const raw = process.env.ADMIN_TELEGRAM_IDS || '';
    const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
    const set = new Set(ids);

    // Default admin ID from project configuration
    set.add('7585875519');

    // Also include any dynamically registered admin chat IDs saved from /start
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
    if (adminIds.length === 0) return true; // If none configured, allow
    const userId = String(ctx.from?.id);
    return adminIds.includes(userId);
}

// Anti-Spam Rate Limiting: 3-Second Cooldown per user
const userLastActionTime = new Map();
const USER_COOLDOWN_MS = 3000;

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
                            await ctx.answerCbQuery(`⏳ অনুগ্রহ করে ${remainingSeconds} সেকেন্ড অপেক্ষা করুন... (3s Cooldown)`, { show_alert: false });
                        } catch (_) {}
                    }
                    return; // Drop spam interaction safely without crashing
                }
                userLastActionTime.set(userId, now);
            }

            if (ctx.chat?.id) {
                await registerAdminChatId(ctx.chat.id);
            }
            if (!(await isAdmin(ctx))) {
                return ctx.reply('⛔ <b>Unauthorized:</b> You do not have permission to access the MI Unlock Admin Panel.', { parse_mode: 'HTML' });
            }
            return next();
        } catch (err) {
            console.error('[BOT MIDDLEWARE ERROR]:', err);
            return next();
        }
    });
}

// Formatters
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

// Duration Selection Keyboard (1d, 3d, 7d, 15d, 30d, 60d, 90d, 180d, 365d, Lifetime)
function getDurationKeyboard(deviceId) {
    return Markup.inlineKeyboard([
        [Markup.button.callback('1 Day', `apv_${deviceId}_1`), Markup.button.callback('3 Days', `apv_${deviceId}_3`)],
        [Markup.button.callback('7 Days', `apv_${deviceId}_7`), Markup.button.callback('15 Days', `apv_${deviceId}_15`)],
        [Markup.button.callback('30 Days', `apv_${deviceId}_30`), Markup.button.callback('60 Days', `apv_${deviceId}_60`)],
        [Markup.button.callback('90 Days', `apv_${deviceId}_90`), Markup.button.callback('180 Days', `apv_${deviceId}_180`)],
        [Markup.button.callback('365 Days (1 Yr)', `apv_${deviceId}_365`), Markup.button.callback('♾️ Lifetime', `apv_${deviceId}_lifetime`)],
        [Markup.button.callback('🔙 Cancel', `view_${deviceId}`)]
    ]);
}

// Extension Keyboard (1d, 3d, 7d, 15d, 30d, 60d, 90d, 180d, 365d)
function getExtensionKeyboard(deviceId) {
    return Markup.inlineKeyboard([
        [Markup.button.callback('+1 Day', `doext_${deviceId}_1`), Markup.button.callback('+3 Days', `doext_${deviceId}_3`)],
        [Markup.button.callback('+7 Days', `doext_${deviceId}_7`), Markup.button.callback('+15 Days', `doext_${deviceId}_15`)],
        [Markup.button.callback('+30 Days', `doext_${deviceId}_30`), Markup.button.callback('+60 Days', `doext_${deviceId}_60`)],
        [Markup.button.callback('+90 Days', `doext_${deviceId}_90`), Markup.button.callback('+180 Days', `doext_${deviceId}_180`)],
        [Markup.button.callback('+365 Days (1 Yr)', `doext_${deviceId}_365`)],
        [Markup.button.callback('🔙 Cancel', `view_${deviceId}`)]
    ]);
}

// Setup Bot Handlers
if (bot) {
    bot.start(async (ctx) => {
        try {
            if (ctx.chat?.id) {
                await registerAdminChatId(ctx.chat.id);
            }
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
            const days = isLifetime ? 0 : parseInt(durStr, 10);
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');

            const updated = await db.approveDevice(deviceId, days, isLifetime, adminId);
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
        try {
            await ctx.answerCbQuery('License revoked');
            const deviceId = ctx.match[1];
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await db.revokeDevice(deviceId, adminId);
            return ctx.editMessageText(`🛑 <b>LICENSE REVOKED</b>\n\n${formatDeviceCard(updated)}`, {
                parse_mode: 'HTML',
                ...getDeviceActionKeyboard(deviceId, updated.status)
            });
        } catch (e) {
            console.error('[BOT revoke error]:', e);
        }
    });

    // Custom Approve Command: /approve <deviceId> <days|lifetime>
    bot.command('approve', async (ctx) => {
        try {
            const parts = ctx.message.text.split(' ').filter(Boolean);
            if (parts.length < 3) {
                return ctx.reply('Usage: <code>/approve &lt;device_id&gt; &lt;days_or_lifetime&gt;</code>\nExample: <code>/approve MI-XXXXXXXXXX 30</code> or <code>/approve MI-XXXXXXXXXX lifetime</code>', { parse_mode: 'HTML' });
            }
            const deviceId = parts[1].trim();
            const durStr = parts[2].toLowerCase().trim();
            const isLifetime = durStr === 'lifetime';
            const days = isLifetime ? 0 : parseInt(durStr, 10);
            if (!isLifetime && isNaN(days)) {
                return ctx.reply('Invalid duration. Use a number of days (e.g. 30) or <code>lifetime</code>.', { parse_mode: 'HTML' });
            }
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await db.approveDevice(deviceId, days, isLifetime, adminId);
            return ctx.replyWithHTML(`✅ <b>DEVICE APPROVED (CUSTOM)</b>\n\n${formatDeviceCard(updated)}`, getDeviceActionKeyboard(deviceId, updated.status));
        } catch (e) {
            console.error('[BOT cmd approve error]:', e);
            return ctx.reply(`Error: ${escapeHtml(e.message)}`);
        }
    });

    // Block action
    bot.action(/blk_(.+)/, async (ctx) => {
        try {
            await ctx.answerCbQuery('Device blocked');
            const deviceId = ctx.match[1];
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await db.blockDevice(deviceId, adminId);
            return ctx.editMessageText(`🚫 <b>DEVICE BLOCKED</b>\n\n${formatDeviceCard(updated)}`, {
                parse_mode: 'HTML',
                ...getDeviceActionKeyboard(deviceId, updated.status)
            });
        } catch (e) {
            console.error('[BOT block error]:', e);
        }
    });

    // Unblock action
    bot.action(/unblk_(.+)/, async (ctx) => {
        try {
            await ctx.answerCbQuery('Device unblocked');
            const deviceId = ctx.match[1];
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await db.unblockDevice(deviceId, 'APPROVED', 30, adminId);
            return ctx.editMessageText(`🔓 <b>DEVICE UNBLOCKED (30 Days License)</b>\n\n${formatDeviceCard(updated)}`, {
                parse_mode: 'HTML',
                ...getDeviceActionKeyboard(deviceId, updated.status)
            });
        } catch (e) {
            console.error('[BOT unblock error]:', e);
        }
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
        try {
            await ctx.answerCbQuery('License extended');
            const deviceId = ctx.match[1];
            const days = parseInt(ctx.match[2], 10);
            const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
            const updated = await db.extendLicense(deviceId, days, adminId);
            return ctx.editMessageText(`🎉 <b>LICENSE EXTENDED BY +${days} DAYS!</b>\n\n${formatDeviceCard(updated)}`, {
                parse_mode: 'HTML',
                ...getDeviceActionKeyboard(deviceId, updated.status)
            });
        } catch (e) {
            console.error('[BOT doext error]:', e);
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
