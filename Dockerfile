# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
WORKDIR /repo
ENV CI=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && npm install -g vite-plus

FROM base AS build
COPY . .
ARG VITE_HOSTED_APP_URL
ARG VITE_HOSTED_APP_CHANNEL=latest
ARG APP_VERSION=local
ARG VITE_CLERK_PUBLISHABLE_KEY=
ARG VITE_CLERK_JWT_TEMPLATE=
ARG VITE_T3CODE_RELAY_URL=
ARG VITE_RELAY_OTLP_TRACES_URL=
ARG VITE_RELAY_OTLP_TRACES_DATASET=
ARG VITE_RELAY_OTLP_TRACES_TOKEN=
ENV VITE_HOSTED_APP_URL=$VITE_HOSTED_APP_URL \
    VITE_HOSTED_APP_CHANNEL=$VITE_HOSTED_APP_CHANNEL \
    APP_VERSION=$APP_VERSION \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    VITE_CLERK_JWT_TEMPLATE=$VITE_CLERK_JWT_TEMPLATE \
    VITE_T3CODE_RELAY_URL=$VITE_T3CODE_RELAY_URL \
    VITE_RELAY_OTLP_TRACES_URL=$VITE_RELAY_OTLP_TRACES_URL \
    VITE_RELAY_OTLP_TRACES_DATASET=$VITE_RELAY_OTLP_TRACES_DATASET \
    VITE_RELAY_OTLP_TRACES_TOKEN=$VITE_RELAY_OTLP_TRACES_TOKEN
RUN vp install --ignore-scripts --filter '@t3tools/scripts...' --filter '@t3tools/web...'
RUN vp run --filter @t3tools/web build && node scripts/apply-web-brand-assets.ts --channel "${VITE_HOSTED_APP_CHANNEL:-latest}"

FROM nginx:1.27-alpine AS runtime
RUN cat <<'EOF' >/etc/nginx/conf.d/default.conf
server {
  listen 80;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location ~* \\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2)$ {
    try_files $uri =404;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
EOF
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
