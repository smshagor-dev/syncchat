# SyncChat

SyncChat is a real-time messaging platform with private and group chat, channels, communities, status stories, media/file sharing, WebRTC calling, push notifications, admin moderation, configurable storage, social authentication, and account security controls.

## Architecture

- **Client:** React, Redux Toolkit, Tailwind CSS, Webpack
- **Admin:** React/Webpack with role and permission-aware management screens
- **API:** Node.js 24, Express, Socket.IO
- **Database:** MongoDB through Mongoose. The repository contains a Sequelize-compatible facade so older controller/model code can keep Sequelize-style calls while MongoDB is the source of truth.
- **Realtime scale:** Socket.IO with optional Redis adapter; Redis is strongly recommended in production and is also used for distributed rate limits and call state.
- **Persistent media:** Admin-configured FTP / explicit FTPS / implicit FTPS
- **Email:** Nodemailer with DB-backed SMTP configuration and environment fallback
- **Calling:** WebRTC with configurable STUN/TURN and optional LiveKit SFU for group calls
- **PWA/push:** service worker, Web Push/VAPID, native push configuration

## Requirements

- Node.js `24.x`
- npm `11.x`
- MongoDB
- Redis for production multi-instance/realtime deployments
- SMTP account for verification/reset emails
- FTP/FTPS storage if uploads are enabled

## Local setup

```bash
git clone https://github.com/smshagor-dev/syncchat.git
cd syncchat

cd backend
npm ci
cp .env.example .env

cd ../frontend
npm ci
cp .env.example .env
```

Configure MongoDB, origins and secrets in `backend/.env`, then configure browser build values in `frontend/.env`.

Run development servers:

```bash
npm run dev:backend
npm run dev:frontend
```

## Production-required secrets

Production startup requires a strong JWT secret of at least 32 characters:

```env
NODE_ENV=production
JWT_SECRET=<long-random-secret-at-least-32-characters>
USER_ACCESS_TOKEN_TTL=7d
ADMIN_ACCESS_TOKEN_TTL=7d
TWO_FACTOR_TOKEN_TTL=10m
```

Optional encryption keys should be stable across deployments:

```env
STORAGE_CONFIG_SECRET=<stable-random-secret>
SMTP_CONFIG_SECRET=<stable-random-secret>
CALL_CONFIG_SECRET=<stable-random-secret>
CHAT_AI_CONFIG_SECRET=<stable-random-secret>
SOCIAL_AUTH_CONFIG_SECRET=<stable-random-secret>
```

Changing encryption keys can make existing encrypted provider/storage credentials unreadable. Changing `JWT_SECRET` invalidates existing signed sessions.

## SMTP / email delivery

SMTP can be configured in **Admin → App Config**. The SMTP password is encrypted at rest with AES-256-GCM before it is stored in MongoDB. Legacy plaintext SMTP passwords are transparently migrated to encrypted storage when the configuration is loaded.

Environment fallback is also supported:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=no-reply@example.com
SMTP_PASS=<provider-password-or-app-password>
SMTP_FROM_NAME=SyncChat
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_TLS_REJECT_UNAUTHORIZED=true
```

Port behavior:

- `465`: implicit TLS (`secure=true`)
- `587`: STARTTLS (`secure=false`, TLS required)
- `25` / `2525`: non-implicit TLS transport; provider policy still applies

Protected admin diagnostics:

```text
GET  /api/admin/mail/status?verify=1
POST /api/admin/mail/test
```

`POST /api/admin/mail/test` accepts an optional JSON body:

```json
{ "to": "you@example.com" }
```

If no address is supplied, the authenticated admin email is used.

A successful SMTP submission only proves that the SMTP server accepted the message. Inbox placement also depends on the sending domain/provider. For production delivery configure **SPF, DKIM and DMARC** and use a From address authorized by the SMTP provider.

## Authentication and account recovery

Production hardening includes:

- session-bound user/admin JWTs with issuer, audience and expiry
- mandatory active server-side session records
- blocked/banned/deleted account enforcement
- server-side email-verification enforcement
- 6-digit cryptographically generated verification/reset codes
- HMAC-hashed OTP storage with expiry, retry limits and resend cooldown
- distributed Redis-backed auth/rate limiting with process fallback
- single-use random password-reset tokens stored only as hashes
- all user sessions revoked after password reset
- strict registration field allowlist to prevent mass assignment
- strong password policy for user/admin creation and password changes
- verified-provider social account linking with indexed provider identities

After deployment of the hardened JWT format, users/admins holding older tokens may need to sign in once again.

## Upload security

Chat and resumable uploads are validated from file contents before persistent storage. The server does not trust browser MIME metadata alone. Dangerous executable/script/server-side/web-active extensions are rejected, and accepted media/document signatures are checked before FTP/FTPS persistence.

## Health and readiness

```text
GET /api/health
GET /api/ready
```

- `/health` reports process/database liveness.
- `/ready` checks MongoDB and performs a Redis `PING` when Redis is configured. SMTP configuration state is reported but SMTP does not take the core chat API offline.

## Redis

For production:

```env
REDIS_URL=redis://...
```

Redis is used for Socket.IO horizontal fan-out, call state, realtime/chat abuse protection and distributed HTTP/auth rate limits. A single-process memory fallback exists for development/degraded operation but is not a substitute for Redis in a horizontally scaled production deployment.

## Frontend deployment

The root `vercel.json` builds `frontend/` and publishes `frontend/client/public`.

Typical production browser build configuration:

```env
API_BASE_URL=https://api.syncchat.live/api
SOCKET_URL=https://api.syncchat.live
PUBLIC_ORIGIN=https://syncchat.live
CHAT_UPLOAD_LIMIT_MB=100
AVATAR_UPLOAD_LIMIT_MB=10
```

Standalone admin routes are explicitly handled for:

```text
/admin/storage
/admin/calling
/admin/calling-push
/admin/social-auth
```

The same standalone route behavior is mirrored by the frontend Vercel configuration and Apache `.htaccess`.

## Backend/container deployment

The root Dockerfile can build the frontend and run the Node backend with the generated assets:

```bash
docker build -t syncchat .
docker run --env-file backend/.env -p 8080:8080 syncchat
```

For production container/VM deployments configure at minimum:

```env
NODE_ENV=production
PORT=8080
SERVE_FRONTEND=true
APP_ORIGIN=https://syncchat.live,https://www.syncchat.live
PUBLIC_ORIGIN=https://syncchat.live
API_BASE_URL=https://api.syncchat.live/api
SOCKET_URL=https://api.syncchat.live
JWT_SECRET=<strong-secret>
MONGODB_URI=<mongodb-uri>
REDIS_URL=<redis-uri>
```

If a reverse proxy is used, set `TRUST_PROXY=true` only when forwarding headers come from a proxy you control. Vercel forwarding headers are trusted automatically.

## CI / validation

Backend validation recursively syntax-checks all backend JavaScript and runs security regression tests:

```bash
cd backend
npm run build
npm test
npm audit --omit=dev --audit-level=critical
```

Frontend validation:

```bash
cd frontend
npm run build
npm audit --omit=dev --audit-level=critical
```

GitHub Actions runs the same checks for pull requests to `main`.

## Security headers

The Express runtime disables `X-Powered-By`, attaches request IDs and sends baseline production headers including `X-Content-Type-Options`, anti-framing protection, a restrictive object/base/frame CSP, Referrer Policy, Permissions Policy and HSTS in production.

## First administrator bootstrap

A fresh database can create the first administrator through:

```text
GET  /api/admin/bootstrap
POST /api/admin/register
```

Registration is allowed only while the admin collection is empty and is protected by a database bootstrap lock to prevent concurrent first-admin creation. After the first administrator exists, normal admin creation must use authenticated role/permission-controlled admin APIs.

## PWA notifications

Notification permission is no longer requested automatically during page load. Browser permission should be requested from an explicit user action. Local notifications use the canonical PWA icon/badge assets.

## Core feature areas

- registration, login, email verification, password recovery, 2FA and device sessions
- private, group and channel messaging with realtime receipts and delivery
- edit/reply/forward/react/star/pin/search/drafts/mentions/topics/message requests
- E2EE device key directory and secret-chat controls
- file/media/resumable uploads and media processing
- WebRTC audio/video calling, TURN/STUN and optional SFU group calls
- statuses/stories, communities and contact management
- notifications and Web Push
- configurable privacy/chat/media defaults
- admin RBAC, audit logs, user/group/channel moderation and analytics
- DB-backed SMTP, social login, storage, calling and AI-provider configuration

## Repository layout

```text
syncchat/
├── backend/
│   ├── api/
│   ├── server/
│   ├── scripts/
│   ├── test/
│   └── package.json
├── frontend/
│   ├── admin/
│   ├── client/
│   ├── mobile/
│   └── package.json
├── docs/
├── Dockerfile
├── vercel.json
└── README.md
```

## Operational release checklist

Before public production rollout verify:

1. MongoDB is reachable and `/api/ready` is green.
2. Redis is configured for multi-instance/realtime production.
3. `JWT_SECRET` and encryption secrets are strong and stable.
4. SMTP test succeeds and SPF/DKIM/DMARC are valid for the From domain.
5. FTP/FTPS storage test succeeds if uploads are enabled.
6. TURN/SFU/native push credentials are configured if those features are enabled.
7. Frontend `API_BASE_URL` and `SOCKET_URL` point to the production backend.
8. GitHub CI passes before merge/deploy.
9. Production deployment is actually built from the current `main` SHA.
10. Monitor `/api/health`, `/api/ready`, application logs, SMTP failures and realtime connection errors after rollout.
