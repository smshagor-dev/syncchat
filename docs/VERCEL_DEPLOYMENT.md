# SyncChat Vercel Deployment

This repository is prepared to deploy the frontend and backend from the same GitHub repository as two Vercel projects.

## Target architecture

- Frontend Vercel project
  - Root Directory: `frontend`
  - Production domain: `https://syncchat.live`
  - Build config: `frontend/vercel.json`
- Backend Vercel project
  - Root Directory: `backend`
  - Production domain: `https://api.syncchat.live`
  - Express + Socket.IO entrypoint: `backend/api/index.js`
  - Build config: `backend/vercel.json`
- MongoDB Atlas for persistent application data
- Redis for Socket.IO cross-instance broadcasts

## 1. Backend project

Import the GitHub repository into Vercel and set the Root Directory to `backend`.

Set at minimum:

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/syncchat?retryWrites=true&w=majority
MONGODB_DB_NAME=syncchat
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
APP_ORIGIN=https://syncchat.live,https://www.syncchat.live
PUBLIC_ORIGIN=https://syncchat.live
API_BASE_URL=https://api.syncchat.live/api
SOCKET_URL=https://api.syncchat.live
UPLOAD_PUBLIC_ORIGIN=https://api.syncchat.live
SERVE_FRONTEND=false
REDIS_URL=rediss://default:PASSWORD@HOST:6379
```

`REDIS_URL` is optional for a single backend instance, but it is recommended on Vercel because Socket.IO clients can be spread across multiple function instances. When configured, SyncChat automatically installs the Socket.IO Redis adapter at runtime.

The backend health endpoint is:

```text
GET https://api.syncchat.live/api/health
```

A healthy response reports MongoDB as connected and whether Redis is configured.

## 2. Frontend project

Import the same GitHub repository again and set the Root Directory to `frontend`.

Set:

```env
NODE_ENV=production
API_BASE_URL=https://api.syncchat.live/api
SOCKET_URL=https://api.syncchat.live
PUBLIC_ORIGIN=https://syncchat.live
CLIENT_API_BASE_URL=https://api.syncchat.live/api
CLIENT_SOCKET_URL=https://api.syncchat.live
CLIENT_PUBLIC_ORIGIN=https://syncchat.live
ADMIN_API_BASE_URL=https://api.syncchat.live/api
ADMIN_SOCKET_URL=https://api.syncchat.live
ADMIN_PUBLIC_ORIGIN=https://syncchat.live
CHAT_UPLOAD_LIMIT_MB=100
AVATAR_UPLOAD_LIMIT_MB=10
```

`frontend/vercel.json` builds the Webpack production bundle into `client/public` and adds SPA rewrites for both the client and `/admin` routes.

## 3. Domains

Attach the domains after the first successful deployments:

```text
syncchat.live      -> frontend Vercel project
api.syncchat.live  -> backend Vercel project
```

After DNS is active, redeploy both projects so the production URLs are compiled into the frontend bundle and accepted by backend CORS.

## 4. Scheduled messages

The traditional Node deployment runs the scheduled-message worker every five seconds. Vercel Functions are not treated as an always-running background process, so the Vercel entrypoint intentionally does not start that interval.

A protected endpoint is available instead:

```text
GET /api/internal/scheduled-messages/run
Authorization: Bearer <CRON_SECRET>
```

Set a strong `CRON_SECRET` in the backend Vercel project. On Vercel Pro/Enterprise, you can add a once-per-minute Cron Job that calls this endpoint. Do not add a minutely cron to a Hobby project because Hobby cron frequency is more restricted.

## 5. Upload storage warning

The existing SyncChat upload pipeline writes files to `backend/uploads`. That is suitable for a VPS/container with persistent disk, but it is not durable storage on Vercel Functions.

Before relying on production chat media uploads on Vercel, migrate the upload pipeline to persistent object storage such as Vercel Blob, S3, or Cloudflare R2. The API/database/realtime deployment can run on Vercel independently of that storage migration, but locally written media must not be treated as durable on Vercel.

Also note that Vercel Functions have request-size limits; large chat/video uploads should use direct-to-object-storage client uploads instead of passing the entire file through the backend Function.

## 6. Local/VPS compatibility

The Vercel changes do not remove the existing standalone server flow:

```bash
cd backend
npm start
```

`server/index.js` still opens the configured port and starts the five-second scheduled-message worker. The shared bootstrap is used by both standalone and Vercel runtimes.

## 7. Verification checklist

After deployment verify:

1. `GET /api/health` returns 200.
2. Registration/login works against MongoDB.
3. Two browsers can connect to Socket.IO and exchange messages immediately.
4. Group/channel broadcasts reach users connected to different backend instances when Redis is enabled.
5. Browser refresh works on client routes and `/admin/*` routes.
6. CORS accepts only the intended frontend domains.
7. Scheduled-message cron is configured if scheduled delivery is required.
8. Media uploads use persistent object storage before production use.
