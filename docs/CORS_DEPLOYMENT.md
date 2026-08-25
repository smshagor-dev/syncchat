# Web/API CORS deployment

SyncChat's public web client should use same-origin HTTP API requests in production:

- Browser origin: `https://syncchat.live`
- Browser API base: `/api`
- Vercel proxy destination: `https://api.syncchat.live/api/:path*`
- Socket.IO remains on the configured API/socket origin.

The backend also maintains a strict credentialed CORS allowlist. Production includes the first-party SyncChat origins as a fallback, and additional browser origins can be supplied through `CORS_ORIGINS` as a comma-separated list.

After changing `frontend/client/config.js`, `vercel.json`, or backend CORS configuration, deploy both the `syncchat` web project and the `syncchat-api` project from `main`. Verify that a browser request to `/api/users/social-config` stays on `syncchat.live` and that direct API preflight from `https://syncchat.live` returns the appropriate `Access-Control-Allow-Origin` header.
