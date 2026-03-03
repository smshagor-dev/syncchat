# SyncChat

SyncChat is a real-time chat application with private messaging, group chat, calls, media sharing, and status stories.

## Tech Stack

- Frontend: React, Redux Toolkit, Tailwind CSS, Webpack
- Backend: Node.js, Express, Socket.IO, Sequelize
- Database: MySQL
- Media/Utilities: Multer, Sharp, Nodemailer

## Requirements

- Node.js `16.17.1`
- npm `8.19.2`
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
