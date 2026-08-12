FROM node:22-alpine AS build

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile

COPY backend backend
COPY frontend frontend
COPY docs docs

RUN pnpm --filter @elderflow/backend build \
  && pnpm --filter @elderflow/frontend build \
  && pnpm --filter @elderflow/backend --prod deploy --legacy /app/backend

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

COPY --from=build --chown=node:node /app/backend /app/backend
COPY --from=build --chown=node:node /workspace/backend/dist /app/backend/dist
COPY --from=build --chown=node:node /workspace/frontend/dist /app/frontend/dist

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "backend/dist/main.js"]
