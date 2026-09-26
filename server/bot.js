const { Telegraf, Markup } = require('telegraf');
const db = require('./database');

const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
if (!botToken) {
    console.warn('[BOT] TELEGRAM_BOT_TOKEN is not defined in environment. Telegram bot will not start.');
}

const bot = botToken ? new Telegraf(botToken) : null;

// Allowlist of admin Telegram user IDs (e.g. "123456789,987654321")
function getAdminIds() {
    const raw = process.env.ADMIN_TELEGRAM_IDS || '';
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function isAdmin(ctx) {
    const adminIds = getAdminIds();
    if (adminIds.length === 0) return true; // If none configured in dev, allow access with warning
    const userId = String(ctx.from?.id);
    return adminIds.includes(userId);
}

// Middleware: Admin verification
if (bot) {
    bot.use(async (ctx, next) => {
        if (!isAdmin(ctx)) {
            return ctx.reply('⛔ Unauthorized: You do not have permission to access the MI Unlock Admin Panel.');
        }
        return next();
    });
}

// Formatters
function formatTimestamp(ts) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
}

function formatDeviceCard(d) {
    const statusEmoji = {
        'APPROVED': '🟢 APPROVED',
        'PENDING': '🟡 PENDING',
        'REJECTED': '🔴 REJECTED',
        'EXPIRED': '🔴 EXPIRED',
        'BLOCKED': '🚫 BLOCKED'
    }[d.status] || d.status;

    return `📱 *Device ID:* \`${d.device_id || d.deviceId}\`\n` +
           `🔑 *License ID:* \`${d.license_id || d.licenseId || 'N/A'}\`\n` +
           `👤 *Name:* ${d.user_name || d.userName || 'N/A'}\n` +
           `📞 *Contact:* \`${d.contact_number || d.contactNumber || 'N/A'}\`\n` +
           `✈️ *Telegram:* ${d.telegram_username || d.telegramUsername || 'N/A'}\n` +
           `💬 *WhatsApp:* \`${d.whatsapp_number || d.whatsappNumber || 'N/A'}\`\n` +
           `📊 *Status:* ${statusEmoji}\n` +
           `⏰ *Expires:* ${d.is_lifetime ? '♾️ Lifetime' : formatTimestamp(d.expiration_at || d.expirationTimestamp)}\n` +
           `👁️ *Last Seen:* ${formatTimestamp(d.last_seen_at || d.lastSeenTimestamp)}\n` +
           `📱 *Model:* ${d.brand || ''} ${d.model || ''} (v${d.app_version || 1})`;
}

// Main Admin Keyboard
function getMainMenu() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Search Device', 'menu_search'), Markup.button.callback('📋 Pending Requests', 'list_PENDING_1')],
        [Markup.button.callback('✅ Approved Devices', 'list_APPROVED_1'), Markup.button.callback('⏳ Expiring Soon', 'list_EXPIRING_1')],
        [Markup.button.callback('❌ Rejected', 'list_REJECTED_1'), Markup.button.callback('🚫 Blocked', 'list_BLOCKED_1')],
        [Markup.button.callback('📱 All Devices', 'list_ALL_1'), Markup.button.callback('📊 Statistics', 'menu_stats')],
        [Markup.button.callback('📜 Audit Logs', 'menu_audit'), Markup.button.callback('⚙️ Settings', 'menu_settings')]
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
        const stats = await db.getStatistics();
        const welcome = `🛡️ *MI UNLOCK ADMIN PANEL*\n\n` +
                        `Welcome, ${ctx.from.first_name || 'Admin'}!\n` +
                        `Pending Approvals: *${stats.pending}*\n` +
                        `Active Licenses: *${stats.approved}*\n\n` +
                        `Use the buttons below to manage devices and licenses:`;
        return ctx.replyWithMarkdown(welcome, getMainMenu());
    });

    bot.command('search', async (ctx) => {
        const query = ctx.message.text.replace('/search', '').trim();
        if (!query) {
            return ctx.reply('Usage: `/search <device_id | phone | telegram | name>`', { parse_mode: 'Markdown' });
        }

        const results = await db.searchDevices(query);
        if (results.length === 0) {
            return ctx.reply(`🔍 No devices found matching: "${query}"`);
        }

        for (const item of results.slice(0, 5)) {
            await ctx.replyWithMarkdown(formatDeviceCard(item), getDeviceActionKeyboard(item.device_id, item.status));
        }
    });

    bot.action('menu_home', async (ctx) => {
        await ctx.answerCbQuery();
        return ctx.editMessageText('🛡️ *MI UNLOCK ADMIN PANEL*\n\nSelect an option:', {
            parse_mode: 'Markdown',
            ...getMainMenu()
        });
    });

    bot.action('menu_stats', async (ctx) => {
        await ctx.answerCbQuery();
        const stats = await db.getStatistics();
        const text = `📊 *MI UNLOCK SYSTEM STATISTICS*\n\n` +
                     `📱 Total Devices: *${stats.total}*\n` +
                     `🟡 Pending Approvals: *${stats.pending}*\n` +
                     `🟢 Active Licenses: *${stats.approved}*\n` +
                     `⏳ Expiring in 7 Days: *${stats.expiringSoon}*\n` +
                     `🔴 Expired Devices: *${stats.expired}*\n` +
                     `🚫 Blocked Devices: *${stats.blocked}*\n` +
                     `❌ Rejected Requests: *${stats.rejected}*\n` +
                     `👁️ Active in last 24h: *${stats.activeLast24h}*`;
        return ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Menu', 'menu_home')]])
        });
    });

    bot.action('menu_audit', async (ctx) => {
        await ctx.answerCbQuery();
        const logs = await db.getRecentAuditLogs(10);
        let text = `📜 *RECENT ADMIN AUDIT LOGS*\n\n`;
        if (logs.length === 0) {
            text += `No audit logs recorded yet.`;
        } else {
            logs.forEach(l => {
                text += `• \`${formatTimestamp(l.created_at)}\` [${l.action_type}] Device: \`${l.target_device_id || 'N/A'}\`\n  _${l.details}_\n\n`;
            });
        }
        return ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Menu', 'menu_home')]])
        });
    });

    bot.action('menu_search', async (ctx) => {
        await ctx.answerCbQuery();
        return ctx.reply('Send `/search <query>` to find any device by Device ID, phone number, name, or Telegram handle.');
    });

    // Device listing with pagination: list_<STATUS>_<PAGE>
    bot.action(/list_(ALL|PENDING|APPROVED|REJECTED|BLOCKED|EXPIRING)_(\d+)/, async (ctx) => {
        await ctx.answerCbQuery();
        const status = ctx.match[1];
        const page = parseInt(ctx.match[2], 10);

        const data = await db.getDevicesByStatus(status, page, 5);
        if (data.items.length === 0) {
            return ctx.editMessageText(`No devices found in category: *${status}*`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Menu', 'menu_home')]])
            });
        }

        let message = `📋 *DEVICE LIST (${status})* - Page ${data.page}/${data.totalPages || 1}\n\n`;
        const buttons = [];

        data.items.forEach((item, idx) => {
            const num = (page - 1) * 5 + idx + 1;
            message += `${num}. \`${item.device_id}\` (${item.user_name || 'N/A'}) - ${item.status}\n`;
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
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    });

    // View specific device details
    bot.action(/view_(.+)/, async (ctx) => {
        await ctx.answerCbQuery();
        const deviceId = ctx.match[1];
        const lic = await db.getLicense(deviceId);
        if (!lic) return ctx.reply(`Device ${deviceId} not found.`);

        return ctx.editMessageText(formatDeviceCard(lic), {
            parse_mode: 'Markdown',
            ...getDeviceActionKeyboard(deviceId, lic.status)
        });
    });

    // Duration picker
    bot.action(/dur_(.+)/, async (ctx) => {
        await ctx.answerCbQuery();
        const deviceId = ctx.match[1];
        return ctx.editMessageText(`⏱️ Select License Duration for device \`${deviceId}\`:`, {
            parse_mode: 'Markdown',
            ...getDurationKeyboard(deviceId)
        });
    });

    // Approve action: apv_<deviceId>_<duration>
    bot.action(/apv_(.+)_(lifetime|\d+)/, async (ctx) => {
        await ctx.answerCbQuery('Processing approval...');
        const deviceId = ctx.match[1];
        const durStr = ctx.match[2];
        const isLifetime = durStr === 'lifetime';
        const days = isLifetime ? 0 : parseInt(durStr, 10);
        const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');

        const updated = await db.approveDevice(deviceId, days, isLifetime, adminId);
        return ctx.editMessageText(`✅ *DEVICE APPROVED SUCCESSFULLY!*\n\n${formatDeviceCard(updated)}`, {
            parse_mode: 'Markdown',
            ...getDeviceActionKeyboard(deviceId, updated.status)
        });
    });

    // Reject action
    bot.action(/rej_(.+)/, async (ctx) => {
        await ctx.answerCbQuery();
        const deviceId = ctx.match[1];
        const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
        const updated = await db.rejectDevice(deviceId, 'Admin rejected request', adminId);
        return ctx.editMessageText(`❌ *REQUEST REJECTED*\n\n${formatDeviceCard(updated)}`, {
            parse_mode: 'Markdown',
            ...getDeviceActionKeyboard(deviceId, updated.status)
        });
    });

    // Revoke action
    bot.action(/rev_(.+)/, async (ctx) => {
        await ctx.answerCbQuery('License revoked');
        const deviceId = ctx.match[1];
        const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
        const updated = await db.revokeDevice(deviceId, adminId);
        return ctx.editMessageText(`🛑 *LICENSE REVOKED*\n\n${formatDeviceCard(updated)}`, {
            parse_mode: 'Markdown',
            ...getDeviceActionKeyboard(deviceId, updated.status)
        });
    });

    // Custom Approve Command: /approve <deviceId> <days|lifetime>
    bot.command('approve', async (ctx) => {
        const parts = ctx.message.text.split(' ').filter(Boolean);
        if (parts.length < 3) {
            return ctx.reply('Usage: `/approve <device_id> <days_or_lifetime>`\nExample: `/approve MI-XXXXXXXXXX 30` or `/approve MI-XXXXXXXXXX lifetime`', { parse_mode: 'Markdown' });
        }
        const deviceId = parts[1].trim();
        const durStr = parts[2].toLowerCase().trim();
        const isLifetime = durStr === 'lifetime';
        const days = isLifetime ? 0 : parseInt(durStr, 10);
        if (!isLifetime && isNaN(days)) {
            return ctx.reply('Invalid duration. Use a number of days (e.g. 30) or `lifetime`.');
        }
        const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
        try {
            const updated = await db.approveDevice(deviceId, days, isLifetime, adminId);
            return ctx.replyWithMarkdown(`✅ *DEVICE APPROVED (CUSTOM)*\n\n${formatDeviceCard(updated)}`, getDeviceActionKeyboard(deviceId, updated.status));
        } catch (e) {
            return ctx.reply(`Error: ${e.message}`);
        }
    });

    // Block action
    bot.action(/blk_(.+)/, async (ctx) => {
        await ctx.answerCbQuery('Device blocked');
        const deviceId = ctx.match[1];
        const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
        const updated = await db.blockDevice(deviceId, adminId);
        return ctx.editMessageText(`🚫 *DEVICE BLOCKED*\n\n${formatDeviceCard(updated)}`, {
            parse_mode: 'Markdown',
            ...getDeviceActionKeyboard(deviceId, updated.status)
        });
    });

    // Unblock action
    bot.action(/unblk_(.+)/, async (ctx) => {
        await ctx.answerCbQuery('Device unblocked');
        const deviceId = ctx.match[1];
        const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
        const updated = await db.unblockDevice(deviceId, 'APPROVED', 30, adminId);
        return ctx.editMessageText(`🔓 *DEVICE UNBLOCKED (30 Days License)*\n\n${formatDeviceCard(updated)}`, {
            parse_mode: 'Markdown',
            ...getDeviceActionKeyboard(deviceId, updated.status)
        });
    });

    // Extension options
    bot.action(/ext_(.+)/, async (ctx) => {
        await ctx.answerCbQuery();
        const deviceId = ctx.match[1];
        return ctx.editMessageText(`⏳ Select Extension Period for device \`${deviceId}\`:`, {
            parse_mode: 'Markdown',
            ...getExtensionKeyboard(deviceId)
        });
    });

    // Execute extension
    bot.action(/doext_(.+)_(\d+)/, async (ctx) => {
        await ctx.answerCbQuery('License extended');
        const deviceId = ctx.match[1];
        const days = parseInt(ctx.match[2], 10);
        const adminId = String(ctx.from?.username || ctx.from?.id || 'Admin');
        const updated = await db.extendLicense(deviceId, days, adminId);
        return ctx.editMessageText(`🎉 *LICENSE EXTENDED BY +${days} DAYS!*\n\n${formatDeviceCard(updated)}`, {
            parse_mode: 'Markdown',
            ...getDeviceActionKeyboard(deviceId, updated.status)
        });
    });
}

// Function to broadcast new approval request to all configured admins
async function notifyAdminsNewRequest(requestData) {
    if (!bot) return;
    const adminIds = getAdminIds();
    if (adminIds.length === 0) return;

    const message = `🔔 *NEW APPROVAL REQUEST*\n\n` +
                    `📱 *Device ID:* \`${requestData.deviceId}\`\n` +
                    `🔑 *License ID:* \`${requestData.licenseId || 'N/A'}\`\n` +
                    `👤 *Name:* ${requestData.userName}\n` +
                    `📞 *Contact:* \`${requestData.contactNumber}\`\n` +
                    `✈️ *Telegram:* ${requestData.telegramUsername || 'N/A'}\n` +
                    `💬 *WhatsApp:* \`${requestData.whatsappNumber || 'N/A'}\`\n` +
                    `📊 *Status:* 🟡 PENDING`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('✅ APPROVE', `dur_${requestData.deviceId}`),
            Markup.button.callback('❌ REJECT', `rej_${requestData.deviceId}`)
        ],
        [Markup.button.callback('🔍 VIEW DEVICE', `view_${requestData.deviceId}`)]
    ]);

    for (const adminId of adminIds) {
        try {
            await bot.telegram.sendMessage(adminId, message, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (e) {
            console.error(`[BOT] Failed to notify admin ${adminId}:`, e.message);
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
