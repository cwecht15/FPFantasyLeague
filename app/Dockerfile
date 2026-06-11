# syntax=docker/dockerfile:1
# Multi-stage build. One image serves two Fly process groups:
#   - `app`    -> node server.js        (Next.js standalone web server)
#   - `worker` -> node dist/worker.js   (self-contained esbuild bundle)
# The app DB is remote (Neon) so there is no SQLite/volume to bake or seed.

ARG NODE_VERSION=20-alpine

# ---- Stage 1: install deps ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# bcryptjs is pure-JS; no native toolchain needed. (pg-native is excluded.)
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Stage 2: build (next standalone + worker bundle) ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# ---- Stage 3: lean runtime ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone web server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Worker bundle (self-contained, no node_modules needed)
COPY --from=builder /app/dist ./dist

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
# Default command (overridden per-process by fly.toml [processes]).
CMD ["node", "server.js"]
