FROM node:24-bookworm-slim AS frontend-deps
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM frontend-deps AS frontend-build
COPY frontend/ ./
ARG API_BASE_URL=""
ARG SOCKET_URL=""
ARG PUBLIC_ORIGIN=""
ARG CHAT_UPLOAD_LIMIT_MB="100"
ARG AVATAR_UPLOAD_LIMIT_MB="10"
ENV API_BASE_URL=$API_BASE_URL
ENV SOCKET_URL=$SOCKET_URL
ENV PUBLIC_ORIGIN=$PUBLIC_ORIGIN
ENV CHAT_UPLOAD_LIMIT_MB=$CHAT_UPLOAD_LIMIT_MB
ENV AVATAR_UPLOAD_LIMIT_MB=$AVATAR_UPLOAD_LIMIT_MB
RUN npm run build

FROM node:24-bookworm-slim AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
# package-lock is refreshed by npm install after the MongoDB dependency migration.
RUN npm install --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV SERVE_FRONTEND=true

COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/client/public ./frontend/client/public

RUN mkdir -p /app/backend/logs /app/backend/uploads

WORKDIR /app/backend
EXPOSE 8080

CMD ["npm", "start"]
