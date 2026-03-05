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
npm install
cp .env.example .env
```

Update `.env` with your local values before running.

## Run

```bash
# start backend + frontend together
npm run dev

# backend only
npm run dev:server

# frontend only
npm run dev:client
```

## Build and Start

```bash
npm run build
npm start
```

## Folder Structure

```text
syncchat/
|-- client/
|   |-- api/
|   |-- components/
|   |   |-- auth/
|   |   |-- chat/
|   |   |-- mockups/
|   |   `-- modals/
|   |-- containers/
|   |-- helpers/
|   |-- json/
|   |-- pages/
|   |-- public/
|   |-- pwa/
|   |-- redux/
|   `-- routes/
|-- server/
|   |-- controllers/
|   |-- db/
|   |   `-- models/
|   |-- helpers/
|   |-- middleware/
|   |-- routes/
|   `-- socket/
|       `-- events/
|-- scripts/
|   `-- wait-for-port.js
|-- uploads/
|-- logs/
|-- package.json
|-- webpack.common.js
|-- webpack.dev.js
`-- webpack.prod.js
```

## Notes

- `uploads/` stores runtime uploaded files.
- `logs/` contains runtime logs.
- `client/public/` contains built frontend assets.

## Version

- App version: `1.0.0`
- Node.js: `24.14.0`
- npm: `11.9.0`
- Last updated: `2026-03-05`

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

## Recent Changes (2026-03-03)

- Added private chat lock (per-user) with lock/unlock/change-password flow.
- Added app-level lock in Settings (enable, remove with password verify, change password).
- Added post-login app unlock screen when app lock is enabled.
- App unlock is remembered for current browser tab session (no repeated prompt on refresh).
- Improved chat list unread behavior:
  - unread filters now count unread chats
  - per-chat unread badge shows unread message count
  - unread rows show bold visual state
- Fixed popup/modal layering and clipping using centered portal rendering.
- Improved sidebar unread badge counting to match unread chat count logic.
- Improved webpack compile performance with filesystem + babel caching and faster dev sourcemap.
