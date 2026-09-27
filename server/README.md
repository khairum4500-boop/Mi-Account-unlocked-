# MI Unlock — Backend & Telegram Admin Bot Documentation

This directory contains the production-ready Node.js/Express backend server, SQLite database engine, and interactive Telegram Admin Bot for the **MI Unlock** Android application.

---

## 🌟 Key Architecture & Security Highlights

1. **Server-Authoritative Licensing:**
   - The Android client queries the server for authorization.
   - Statuses: `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, `BLOCKED`, `REVOKED`.
   - Expiration timestamps are strictly enforced server-side; client clock tampering is detected and mitigated with SHA-256 integrity checksums and short bounded offline grace periods (24 hours).

2. **Zero In-APK Secrets:**
   - The Telegram Bot Token, Database credentials, and Admin API secrets remain on the backend only.
   - Android client communicates strictly with the public `/api/` endpoints.

3. **Telegram Admin Bot (`bot.js`):**
   - Push notifications to admins upon any new device approval request.
   - One-tap approval with both legacy day presets and fine-grained time presets: 30 Min, 1 Hour, 2 Hours, 3 Hours, 6 Hours, 12 Hours, 1 Day, 3 Days, 7 Days, 15 Days, 30 Days, 60 Days, 90 Days, 180 Days, 365 Days, Lifetime, Custom.
   - Interactive buttons for Reject, Block, Unblock, and Extend license using the same minute/hour/day presets (except Lifetime for extension) plus Custom Duration.
   - Instant search (`/search <query>`) across device IDs, phone numbers, names, or Telegram handles.
   - Paginated device lists and real-time system statistics.
   - Admin verification via Telegram User ID allowlist (`ADMIN_TELEGRAM_IDS`).

---

## 🚀 Quick Setup & Installation

### Option 1: Native Node.js Run

1. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your values:
   - `TELEGRAM_BOT_TOKEN`: Token obtained from [@BotFather](https://t.me/BotFather).
   - `ADMIN_TELEGRAM_IDS`: Your Telegram numeric User ID (message [@userinfobot](https://t.me/userinfobot) to get your ID).
   - `ADMIN_API_KEY`: Secret string for programmatic API access.

3. **Start the server and bot:**
   ```bash
   npm start
   ```

---

### Option 2: Docker / Docker Compose

1. Edit `.env` with your tokens.
2. Run:
   ```bash
   docker-compose up -d --build
   ```

---

## 📡 API Reference

### Public Client Endpoints

- `GET /api/app/config`: Returns system settings (maintenance mode, update requirements, announcement, contact details).
- `GET /api/license/status?deviceId={id}`: Returns real-time authorization state, expiration timestamp, and days remaining.
- `POST /api/approval/request`:
  - Body:
    ```json
    {
      "deviceId": "MI-A1B2C3D4",
      "name": "John Doe",
      "contactNumber": "017XXXXXXXX",
      "telegramUsername": "@john_doe",
      "whatsappNumber": "017XXXXXXXX",
      "appVersion": 1,
      "deviceModel": "Redmi Note 13 Pro+",
      "deviceBrand": "Xiaomi"
    }
    ```
- `POST /api/heartbeat`:
  - Body: `{ "deviceId": "MI-A1B2C3D4", "appVersion": 1, "timestamp": 1727350000000 }`

---

### Admin REST API (Header: `x-admin-key: <ADMIN_API_KEY>`)

- `GET /api/admin/devices?status=APPROVED&page=1&limit=10`
- `GET /api/admin/device/:id`
- `POST /api/admin/approve` `{ "deviceId": "...", "durationSeconds": 2592000, "isLifetime": false }` (legacy `durationDays` remains accepted)
- `POST /api/admin/reject` `{ "deviceId": "...", "reason": "Payment required" }`
- `POST /api/admin/block` `{ "deviceId": "..." }`
- `POST /api/admin/unblock` `{ "deviceId": "...", "durationSeconds": 2592000 }` (legacy `durationDays` remains accepted)
- `POST /api/admin/extend` `{ "deviceId": "...", "durationSeconds": 2592000 }` (legacy `days` remains accepted)
- `GET /api/admin/stats`
- `POST /api/admin/config` `{ "key": "maintenance_mode", "value": "true" }`

## Updated Duration & Device Controls

The Telegram admin bot now supports exact-duration licensing instead of day-only licensing.

- Approval presets: 30m, 1h, 2h, 3h, 6h, 12h, 1d, 3d, 7d, 15d, 30d, 60d, 90d, 180d, 365d, Lifetime
- Extension presets: +30m, +1h, +2h, +3h, +6h, +12h, +1d, +3d, +7d, +15d, +30d, +60d, +90d, +180d, +365d
- Unblock presets: 30m, 1h, 2h, 3h, 6h, 12h, 1d, 3d, 7d, 15d, 30d, 60d, 90d, 180d, 365d, Lifetime
- Custom durations: examples `1h`, `2h30m`, `90m`, `2d 4h`
- `/approve <device_id> <duration>` supports the same duration syntax or `lifetime`.
- `duration_seconds` is the exact source value for hour/minute precision; `duration_days` remains for backward compatibility.
- Block preserves the previous license timestamps; Unblock explicitly selects a new activation/expiration window.
- The Expiring Soon list is calculated from the next 7 days rather than treating `EXPIRING` as a stored status.

## Final specification compliance notes

- Android presentation has a persistent seven-language selector: বাংলা, English, हिन्दी, العربية, اردو, 中文, Türkçe.
- Arabic and Urdu use RTL layout direction at the Compose presentation layer only.
- Canonical JSON/HEX output remains independent of localization and uses the exact runtime `passToken`, `userId`, and `deviceId` values.
- HEX is derived from canonical JSON UTF-8 bytes and decoded back with strict UTF-8 validation plus exact-string comparison.
- Copy actions copy only the requested machine-readable value and show a localized confirmation.
- Invalid/missing token data and invalid/missing expiration data are surfaced instead of silently authorizing.
- Countdown remains timestamp-derived and uses the saved server-time offset when available.
- Server admin duration APIs reject durations below 60 seconds or above 10 years unless Lifetime is explicitly selected.
- The Telegram bot supports presets and custom duration input such as `30m`, `1h`, `2h30m`, `90m`, `2d 4h`, and `lifetime`.
- Custom-duration pending state expires automatically and is removed from memory after timeout.
- Expiring/approved/expired listings and statistics evaluate expiration timestamps dynamically rather than trusting stale `APPROVED` rows.
- `/api/admin/*` requires an explicitly configured `ADMIN_API_KEY`; no built-in production admin API secret is used.
