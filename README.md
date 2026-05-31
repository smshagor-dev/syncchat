# SyncChat

SyncChat is a real-time chat application with private messaging, group chat, calls, media sharing, and status stories.

## Tech Stack

- Frontend: React, Redux Toolkit, Tailwind CSS, Webpack
- Backend: Node.js, Express, Socket.IO, Sequelize
- Database: MySQL
- Media/Utilities: Multer, Sharp, Nodemailer

## Requirements

- Node.js `24.14.0`
- npm `11.9.0`
- MySQL running and configured

## Setup

```bash
# backend
cd backend
npm install
cp .env.example .env

# frontend
cd ../frontend
npm install
cp .env.example .env
```

Update each folder's `.env` with its own values before running. Backend secrets stay in `backend/.env`; browser build values stay in `frontend/.env`.

If you want push notifications, generate VAPID keys and set these in `backend/.env`:

```bash
npx web-push generate-vapid-keys
```

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:support@syncchat.app
```

## Run

```bash
# backend only
cd backend
npm run dev

# frontend only
cd frontend
npm run dev
```

You can also run helper commands from the repo root:

```bash
npm run dev:backend
npm run dev:frontend
```

## Separate Build and Deploy

```bash
# backend validation build
cd backend
npm run build

# frontend/admin production assets
cd frontend
npm run build
```

`npm start` inside `backend/` starts only the backend API and Socket.IO server. It does not build or serve the React frontend.

Deploy the frontend/admin build output from `frontend/client/public` on a separate static host. Build it with production frontend targets in `frontend/.env`:

```bash
API_BASE_URL=https://api.syncchat.live/api
SOCKET_URL=https://api.syncchat.live
PUBLIC_ORIGIN=https://syncchat.live
```

On the backend host, set CORS/public origins in `backend/.env`:

```bash
NODE_ENV=production
APP_ORIGIN=https://syncchat.live,https://www.syncchat.live
PUBLIC_ORIGIN=https://syncchat.live
API_BASE_URL=https://api.syncchat.live/api
SOCKET_URL=https://api.syncchat.live
SERVE_FRONTEND=false
```

If you ever need the old combined deployment temporarily, set `SERVE_FRONTEND=true` and make sure `frontend/client/public/index.html` and `frontend/client/public/admin/index.html` exist.

## Vercel Frontend Deploy

This repo now includes a root-level `vercel.json` that builds only the `frontend/` app and publishes `frontend/client/public` as a static output.

Use these Vercel project settings:

- Root Directory: repo root (`syncchat`)
- Install Command: auto-loaded from `vercel.json`
- Build Command: auto-loaded from `vercel.json`
- Output Directory: auto-loaded from `vercel.json`
- Node.js version: `24.x`

Set these environment variables in the Vercel project before deploying:

```bash
API_BASE_URL=https://your-backend-domain/api
SOCKET_URL=https://your-backend-domain
PUBLIC_ORIGIN=https://your-vercel-domain.vercel.app
CHAT_UPLOAD_LIMIT_MB=100
AVATAR_UPLOAD_LIMIT_MB=10
```

The included rewrites keep both SPAs working after refresh:

- `/admin` and `/admin/*` -> admin app
- all other non-file routes -> client app

Important: the backend in `backend/` uses Express + Socket.IO + MySQL and is not a good fit for Vercel serverless hosting. Deploy it on a VM/container host instead, then point the Vercel frontend env vars to that backend.

## Docker Deploy

The root `Dockerfile` builds the frontend bundle first, then starts the backend in production mode with `SERVE_FRONTEND=true`. That gives you one container that can serve both the API and the built frontend when you are not using Vercel for the frontend.

Build and run it like this:

```bash
docker build -t syncchat .
docker run --env-file backend/.env -p 8080:8080 syncchat
```

If you want the containerized frontend to point at production URLs during the image build, pass them as build args:

```bash
docker build -t syncchat \
  --build-arg API_BASE_URL=https://your-api-domain/api \
  --build-arg SOCKET_URL=https://your-api-domain \
  --build-arg PUBLIC_ORIGIN=https://your-frontend-domain .
```

For container deploys, make sure these backend env vars are set for your real domain:

```bash
NODE_ENV=production
PORT=8080
SERVE_FRONTEND=true
APP_ORIGIN=https://your-frontend-domain
PUBLIC_ORIGIN=https://your-frontend-domain
API_BASE_URL=https://your-api-domain/api
SOCKET_URL=https://your-api-domain
UPLOAD_PUBLIC_ORIGIN=https://your-api-domain
```

## Backend cPanel Node.js Setup

Use these values in cPanel Node.js App:

- Application root: `backend`
- Application startup file: `server/index.js`
- Start command: `npm start`

With this setup, the Node app serves only:

- `/api` -> backend API + Socket.IO
- `/uploads` -> uploaded media

## Folder Structure

```text
syncchat/
|-- frontend/
|   |-- admin/
|   |-- client/
|   |-- mobile/
|   |-- scripts/
|   |-- package.json
|   |-- webpack.common.js
|   |-- webpack.dev.js
|   `-- webpack.prod.js
|-- backend/
|   |-- server/
|   |-- scripts/
|   |-- uploads/
|   |-- logs/
|   `-- package.json
|-- docs/
|-- package.json
`-- README.md
```

## Notes

- `backend/uploads/` stores runtime uploaded files.
- `backend/logs/` contains runtime logs.
- `frontend/client/public/` contains built frontend assets.

## Version

- App version: `1.0.0`
- Node.js: `24.14.0`
- npm: `11.9.0`
- Last updated: `2026-03-18`

## Core System Features

- Authentication and account lifecycle:
  - register/login with token-based auth
  - email/account verification flow
  - forgot-password request/verify/reset
- Profile and identity:
  - profile edit (name/bio/contact fields)
  - avatar upload and update
- Contacts and relationship controls:
  - add/list/search contacts
  - contact delete
  - block/unblock with block-state checks
- Realtime private and group messaging:
  - Socket.IO-based message delivery and room updates
  - text messaging with read/delivered state
  - reply, forward, react, edit, and delete message actions
  - unread counters and inbox synchronization
- Media and file messaging:
  - chat file upload support
  - image/video/file/audio attachments in chat
  - media/call/starred retrieval endpoints
- Group collaboration foundation:
  - group create/open/join by invite link
  - participant listing and participant management flows
  - group privacy/public-private controls
- Status/story system foundation:
  - status post, view tracking, reaction, and reply APIs
  - status activity feed and status delete
- Calling foundation:
  - in-chat audio/video call initiation UI
  - call log retrieval and call-type preview in inbox
- Settings foundation:
  - user settings read/update pipeline
  - privacy/notification/chat-preference persistence at account level

## SyncChat Admin Panel Checklist (`/syncchat/admin`)

Everything here should be dynamic (DB-driven + API-controlled) and not hardcoded.

- [ ] Admin access & roles
- [ ] Admin login and session management
- [ ] Super admin vs moderator roles
- [ ] Role-based permission matrix (read/write/ban/delete/export)
- [ ] Audit log for admin actions
- [ ] Admin profile and access keys

- [x] User management
- [x] Search/filter users (status, verification, last seen)
- [x] View user profile and activity summary
- [x] Block/unblock user (global)
- [x] Force logout user sessions
- [x] Reset user 2FA / recovery codes
- [x] Account export request review
- [x] Delete user account (soft delete + hard delete)

- [x] Group management
- [x] Search groups and view group profile
- [x] Promote/demote group admins
- [x] Remove members
- [x] Update group permissions
- [x] Update group moderation (slow mode, banned words, blocked media)
- [x] Join request approval flow

- [x] Channel management
- [x] Search channels and view channel profile
- [x] Promote/demote channel admins
- [x] Remove subscribers
- [x] Update channel permissions
- [x] Update channel moderation (slow mode, banned words, blocked media)
- [x] Join request approval flow

- [x] Report & moderation center
- [x] Review user reports (chat, group, channel, status)
- [x] Action on reports (warn, mute, ban, delete content)
- [x] Auto-moderation rule editor
- [x] Banned words list
- [x] Media-type blocking rules
- [x] Slow mode presets
- [x] Moderation history + outcomes

- [x] Content controls
- [x] Delete messages (single/multi)
- [x] Remove media (image/video/audio/document)
- [x] Disable link previews for abusive domains
- [x] Status/story takedown
- [x] Pinned message removal
- [x] Poll/quiz takedown

- [x] Security & compliance
- [x] Device/session manager (per user)
- [x] Suspicious login review
- [x] IP/device blacklist
- [x] Rate limit settings
- [x] Web push/VAPID status
- [x] GDPR-style data export + erase tracking

- [x] App config (dynamic settings)
- [x] Toggle features (feature flags)
- [x] Default privacy settings
- [x] Default chat settings
- [x] Notification settings defaults
- [x] Upload limits (size, type)
- [x] Media processing profile (HD/SD)
- [x] Maintenance mode

- [x] Analytics & monitoring
- [x] User growth and active users
- [x] Message/voice/video usage
- [x] Storage usage (uploads)
- [x] Report volume and resolution time
- [x] System health widgets

## Recent Changes (2026-03-03)

- Added private chat lock (per-user) with lock/unlock/change-password flow.
- Added app-level lock in Settings (enable, remove with password verify, change password).
- Added post-login app unlock screen when app lock is enabled.
- App unlock is remembered for current browser tab session (no repeated prompt on refresh).
- Improved chat list unread behavior:
  - unread filters now count unread chats
  - per-chat unread badge shows unread message count

## Recent Changes (2026-03-18)

- Admin Analytics & Monitoring dashboard with summary cards and Chart.js charts.
- Real-time analytics updates via Socket.IO with refresh controls and last-refreshed indicator.
- Server Status panel with uptime, load average, memory usage, Node version, and reset action.
- Full Analytics tab with date range filters, stacked bar chart, and report-status donut chart.
- App Config enhancements: app logo + SEO image upload/clear, SEO meta settings, SMTP settings.
- Client branding/SEO: app name/logo and SEO tags applied to login/auth and chat pages.
- Channel rating & review system (client submission + admin moderation).
- App Config UI refresh: equal-height cards, two-column layout, and responsive styling.

## Recent Changes (2026-03-04)

- Updated group admin system to support multiple admins (`adminsId`):
  - `Make as admin` now adds a new admin without replacing the existing admin.
  - Added `Remove from admin` action.
  - Enforced safety checks to keep at least one admin in a group.
- Added shared group-admin helper logic on server and client for consistent permissions checks.
- Improved group participant/admin flows end-to-end:
  - admin promotion/demotion event handling via sockets
  - participant removal now updates admin state safely
  - admin checks in group actions now support multi-admin
- Improved group permissions and moderation UX:
  - professional group permission settings modal
  - member/admin permission toggles
  - pending user request list with approve/reject flow
- Improved group context menu UI and actions:
  - polished action buttons
  - clearer admin management options
- Updated group chat composer behavior to respect admin-only messaging using multi-admin checks.


## Recent Changes (2026-03-05)

- Added real-time status post delivery using sockets:
  - new status broadcasts instantly to owner + friends (`status/new`)
  - inbox status rail and status page now update without manual refresh
- Updated status rail "Create" item to show current user avatar with add badge.
- Improved logout flow:
  - fixed chat-list 3-dot menu logout modal open behavior
  - added logout option at the end of Settings page
  - fixed signout modal popup layering/positioning (`fixed inset` behavior)
- Added social auth support (DB upsert + token flow) for:
  - Google
  - Facebook
  - Telegram
- Added social auth endpoints:
  - `GET /api/users/social-config`
  - `POST /api/users/social-auth`
- Updated env docs for social providers:
  - `GOOGLE_CLIENT_ID`
  - `FACEBOOK_APP_ID`
  - `TELEGRAM_BOT_USERNAME`
  - `TELEGRAM_BOT_TOKEN`
- Updated login/register social UI:
  - Google/Facebook/Telegram shown in one horizontal row
  - improved responsive sizing for mobile layout

## Recent Changes (2026-03-08)

- Added full channel system with separate `channels` table and Socket.IO-based realtime updates.
- Added channel create/join/private-password flow:
  - public and private channels
  - private channel password verify before open
  - custom in-app password popup (no browser prompt)
- Added channel profile/info flow:
  - channel info panel
  - channel-specific labels/copy
  - inline channel name edit from info panel
- Added channel avatar persistence:
  - save to local uploads
  - store URL in DB
  - realtime avatar update via sockets
- Added channel chat behavior:
  - admin-only posting by default
  - member posting only if admin enables permission
  - channel messages display using channel identity instead of user identity
- Improved realtime rename/avatar propagation:
  - room header updates instantly
  - inbox/chat list rows update instantly
  - group and channel info stay in sync through sockets
- Improved group and channel subscriber/member inbox insertion:
  - when a user joins or is added/approved, the room now appears in that user's chat list immediately
  - added local fallback insertion for join timing/state edge cases
- Added channel unread badge on sidebar.
- Added settings/features across the app:
  - Privacy subpage
  - Account settings subpage
  - Chats subpage
  - Notifications subpage
  - Voice & Video subpage
  - Keyboard shortcuts subpage
  - License page
- Added Google Authenticator style 2FA for users:
  - enable/disable in settings
  - login verification when enabled
- Added privacy controls end-to-end:
  - last seen / online
  - profile picture
  - status visibility
  - groups
  - read receipts
  - blocked contacts
  - unknown message requests
  - link preview control
- Added chat behavior settings:
  - global wallpaper
  - media quality
  - media auto-download toggles
  - spell check
  - emoji text replacement
  - enter to send
  - keep archived
- Added notification settings:
  - banner / popup / push toggles
  - category-level toggles for message, group, status, call
  - preview toggle
  - outgoing sound toggle
  - mute control
- Added account tools:
  - security notifications setting
  - account info export request flow
- Fixed delete-chat removal so deleted chats disappear from chat list immediately and after refresh.

## Recent Changes (2026-03-09)

- Added end-to-end hidden chat system:
  - `Hide chat` action from chat-list menu
  - hidden chats are removed from the main inbox list immediately
  - hidden chat management inside `Settings -> Privacy`
  - unhide flow restores chats back to the main list
  - backend persistence with hidden-chat filtering on fetch
- Added advanced secret chat / privacy chat system:
  - Advanced Privacy Chat subpage inside friend profile
  - Secret Chat toggle, screenshot alerts, and disappearing timer
  - secret session generation and regeneration
  - secret system notices in the center of the chat timeline
  - forwarding, save/download, and export blocking for secret chats
  - secret chat state sync across room, profile panel, and inbox refresh flow
- Added end-to-end message scheduling:
  - schedule send for later
  - recurring reminders (`daily`, `weekly`, `monthly`)
  - `send when online` for private chats
  - room-level scheduled message list with cancel action
  - background scheduler worker on the server
  - Socket.IO sync for scheduled message updates
- Added reusable scheduled-message delivery pipeline on the backend so scheduled messages use the same room/inbox realtime flow as normal chat messages.
- Added one-time encrypted message/media flow:
  - one-time text from the composer
  - one-time photo/video from the send-file modal
  - blurred/locked preview in chat before opening
  - server-side open-once enforcement
  - after one open, the same user cannot view it again
  - Socket.IO sync when a one-time message is opened
- Updated chat history and inbox preview handling for one-time content:
  - real content is not exposed in normal room payload before open
  - inbox preview shows secure generic wording instead of leaking content
  - chat list preview shows icon + `Sent a photo/video/message` for one-time items

  
## Recent Changes (2026-03-10)

- Added end-to-end pinned message system:
  - multiple pinned messages per room (not single local pin)
  - backend persistence for pinned items + pin history
  - new APIs:
    - `GET /chats/:roomId/pins`
    - `POST /chats/:chatId/pin`
    - `DELETE /chats/:chatId/pin`
  - realtime pin updates via Socket.IO event `chat/pins`
  - room header pinned message panel with:
    - row-based pinned message list
    - pinned-by user info + avatar
    - quick unpin action
    - jump-to-message support
    - history access from 3-dot menu
- Replaced previous localStorage-based pinned flow in room monitor with server-backed pin/unpin.
- Improved room-header pinned UI responsiveness:
  - full-width layout aligned to room header width
  - fixed avatar alignment in header when pinned list expands/collapses
  - collapsed-by-default pinned summary with expand-on-click behavior
  - wider history dropdown for better readability
- Added advanced poll/quiz support end-to-end:
  - poll mode + quiz mode
  - anonymous/non-anonymous voting
  - multi-select voting support
  - close poll action
  - correct-answer support for quizzes
  - closed-state enforcement (no further voting after close)
  - live results updates over sockets for vote and close events
- Updated poll creation modal:
  - mode switcher (`Poll` / `Quiz`)
  - anonymous toggle
  - multi-select toggle
  - correct-option selection for quizzes
  - payload upgraded to poll schema `version: 2`
- Updated poll parsing/serialization across server and client helpers to support new poll fields (`mode`, `anonymous`, `multiSelect`, `correctOptionIds`, `closedAt`, `closedBy`).

## Recent Changes (2026-03-11)

- Added account backup and restore inside `Settings -> Account settings`:
  - encrypted user backup export
  - restore from uploaded archive
  - selective restore for supported account data
  - Google Drive backup upload using the signed-in user's own Drive
- Added multi-device session manager inside Settings:
  - active devices list
  - current device identification
  - remote logout for individual sessions
  - logout other devices
  - suspicious login indicators for new devices or networks
- Added companion-device linking flow similar to WhatsApp/Telegram:
  - `Link new device` popup inside the Devices page
  - QR code + short code pairing flow
  - email verification code delivery
  - second verification code sent through `SyncChat Support` chat
  - full-screen responsive modal instead of a separate subpage
- Added `SyncChat Support` system identity improvements:
  - static SyncChat app icon in room header, message area, and chat list
  - support chat used for secure device-link verification messaging
- Added end-to-end moderation controls for groups and channels:
  - report center for admin review
  - auto moderation rules
  - banned words filtering
  - blocked media type rules
  - slow mode for groups and channels
  - composer and realtime moderation feedback on blocked actions
- Updated chat page document title to show only the site name instead of `@username + site name`.

## Recent Changes (2026-03-12)

- Added recovery codes for Google 2FA:
  - generation/regenerate/revoke flows
  - recovery-code login fallback
  - recovery code status/remaining counts in settings
- Moved recovery codes into a dedicated settings card + modal under 2FA.
- Added secret key copy button in the 2FA setup modal.
- Fixed dark mode styling for 2FA and app-lock popups (and social-auth strip).
- Added in-chat YouTube/Facebook share link embeds with inline playback.
- Added voice note upgrades:
  - waveform
  - playback speed
  - pause/resume recording
  - noise suppression
- Added video upload pipeline:
  - real HD/standard transcoding
  - thumbnail generation
  - streaming preview instead of raw file load
- Added contact labels / folders:
  - work/family/custom labels
  - smart filters
  - custom inbox sections
- Added Web Push notifications (VAPID) for online/offline delivery:
  - browser push subscription storage
  - service-worker push + click handling
  - server-side push dispatch on new messages

## Recent Changes (2026-03-15)

- Added SyncChat admin panel checklist in README for `/syncchat/admin`.
- Added login via QR code with built-in QR scanner flow.
- Added device link QR scan improvements + QR token display/copy + dark mode fixes.
- Added sender/receiver message bubble background + text color settings.
- Fixed MySQL push subscription unique index by using endpoint hash.
