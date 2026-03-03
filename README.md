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
- Last updated: `2026-03-03`

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
