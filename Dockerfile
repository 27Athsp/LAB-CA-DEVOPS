FROM node:24.22.2-alpine3.24 AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.30.6-alpine AS runtime
ARG APP_VERSION=1.0.0
ENV APP_VERSION=${APP_VERSION} API_UPSTREAM=api:3000 NGINX_ENVSUBST_FILTER=API_UPSTREAM
LABEL org.opencontainers.image.version=${APP_VERSION}
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker/frontend-config.sh /docker-entrypoint.d/04-frontend-config.sh
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q --spider http://127.0.0.1:8080/health || exit 1
