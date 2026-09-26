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
   - One-tap approval with duration picker: 1 Day, 7 Days, 30 Days, 90 Days, 180 Days, 1 Year, Lifetime, Custom.
   - Interactive buttons for Reject, Block, Unblock, and Extend license (+1d, +7d, +30d, +90d, +180d, +1y).
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
- `POST /api/admin/approve` `{ "deviceId": "...", "durationDays": 30, "isLifetime": false }`
- `POST /api/admin/reject` `{ "deviceId": "...", "reason": "Payment required" }`
- `POST /api/admin/block` `{ "deviceId": "..." }`
- `POST /api/admin/unblock` `{ "deviceId": "...", "durationDays": 30 }`
- `POST /api/admin/extend` `{ "deviceId": "...", "days": 30 }`
- `GET /api/admin/stats`
- `POST /api/admin/config` `{ "key": "maintenance_mode", "value": "true" }`
