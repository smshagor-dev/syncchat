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
- Last updated: `2026-03-10`

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
