# syntax=docker/dockerfile:1
#
# GetRankRise API.
#
# The repository had no backend deploy artifact at all — only frontend/vercel.json
# — so the API had no reproducible way to ship.
#
# Notes on the choices here:
#   * `npm ci --omit=dev` installs exactly what package-lock.json pins. `npm
#     install` would be free to resolve something newer at build time, which is
#     the opposite of what an image is for.
#   * Runs as a non-root user. Nothing in this app writes to disk, so it does
#     not need the privileges.
#   * dumb-init is PID 1 so SIGTERM actually reaches node. server.js has a
#     graceful shutdown that drains the campaign runner before closing the
#     pool, and without proper signal handling an orchestrator's rolling
#     restart would SIGKILL a worker mid-send — the exact situation the
#     at-most-once delivery logic has to clean up afterwards.
#   * HEALTHCHECK hits /health, which is mounted at the root precisely for
#     platform probes (the app also serves it under /api/v1 for the SPA).

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

# ── Dependencies ──────────────────────────────────────────────────────────────
# Copied separately from the source so a code-only change reuses this layer.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js migrate.js ./
COPY src ./src
COPY migrations ./migrations

# node:alpine already ships an unprivileged `node` user.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# initializeDatabase() runs pending migrations before app.listen(), so there is
# no separate migrate step to sequence in a deployment. A failure there exits
# non-zero and the orchestrator will not route traffic to the container.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
