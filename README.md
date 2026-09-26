# MI Unlock — Full Architecture, Backend & Telegram Bot Guide

## 1. System Architecture Overview

```
                      +-----------------------------+
                      |   Telegram Administrator    |
                      |   (@itz_khairum & Admins)   |
                      +--------------+--------------+
                                     ^
                                     | Telegram Bot API (Inline Buttons)
                                     v
                      +-----------------------------+
                      |    MI Unlock Backend Server |
                      |    (Node.js / Express / DB) |
                      +--------------+--------------+
                                     ^
                                     | HTTPS REST API
                                     v
+-------------------------------------------------------------------------+
|                       Android App (MI Unlock)                           |
|  - Stable Device ID (SHA-256 hashed Android ID)                         |
|  - First-Launch Authorization & Approval Request Form                   |
|  - Server-Authoritative License Status & Expiration Management          |
|  - Offline Grace Period Cache with SHA-256 Tamper Checksum              |
|  - Admin Direct Contact Actions (Telegram, WhatsApp, Call, Email)       |
|  - Dynamic Server Base URL Configuration                                |
+-------------------------------------------------------------------------+
```

---

## 2. Server & Telegram Bot Deployment

### Prerequisites
- Node.js 18+ & npm
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- Your Telegram numeric User ID from [@userinfobot](https://t.me/userinfobot)

### Setup Steps
1. Navigate to `/backend`:
   ```bash
   cd backend
   npm install
   ```
2. Configure `.env`:
   ```bash
   cp .env.example .env
   # Edit BOT_TOKEN and ADMIN_TELEGRAM_IDS
   ```
3. Start the Server:
   ```bash
   npm start
   ```

---

## 3. Administrator Contact Details
Configured in the Android client & backend:
- **Telegram**: [@itz_khairum](https://t.me/itz_khairum)
- **Contact Number**: `01577430152`
- **WhatsApp**: `01735047020`
- **Email**: `siam162536@gmail.com`

---

## 4. API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/app/config` | Retrieves remote dynamic config, maintenance mode, min version, and admin contacts |
| `GET` | `/api/license/status?deviceId=XYZ` | Authoritative license check with server timestamp & expiration |
| `POST` | `/api/approval/request` | Submits new device registration & immediately alerts Telegram Bot admins |
| `POST` | `/api/heartbeat` | Periodic telemetry recording device last seen timestamp |

---

## 5. Security & Anti-Bypass Architecture
1. **Server-Authoritative Clock**: Expiration checks utilize server-side timestamps to prevent local device clock tampering.
2. **Local Cache Tamper Verification**: Cached license state is guarded with a SHA-256 HMAC checksum.
3. **No Private Secrets in APK**: The APK contains zero Telegram tokens or database passwords.
4. **Bounded 24-Hour Offline Grace**: Allows brief transient network drops while strictly prohibiting indefinite offline use.
