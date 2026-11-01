FROM node:24.22.2-alpine3.24 AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:api

FROM build AS production-dependencies
RUN pnpm prune --prod

FROM node:24.22.2-alpine3.24 AS runtime
ARG APP_VERSION=1.0.0
ENV NODE_ENV=production APP_VERSION=${APP_VERSION} HOST=0.0.0.0 PORT=3000
LABEL org.opencontainers.image.version=${APP_VERSION}
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist-api ./dist-api
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=4s --start-period=10s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/health', {signal: AbortSignal.timeout(3000)}).then(r => {if (!r.ok) process.exit(1)}).catch(() => process.exit(1))"
CMD ["node", "dist-api/server.js"]
