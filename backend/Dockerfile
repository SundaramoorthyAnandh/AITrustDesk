# TrustDesk API — multi-stage. Build context is the REPO ROOT (workspaces).
#   docker build -f backend/Dockerfile -t trustdesk-api .

# ── build stage: install backend workspace (compiles/prebuilds better-sqlite3) ──
FROM node:22-slim AS build
WORKDIR /app
# Build tools in case better-sqlite3 has no prebuilt binary for this arch.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy every workspace manifest so npm can resolve the workspace graph, then
# install ONLY the backend workspace (keeps the API image free of React deps).
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
COPY web/customer-portal/package.json ./web/customer-portal/
COPY web/agent-portal/package.json ./web/agent-portal/
RUN npm install -w backend --include-workspace-root

# Application source (src, drizzle migrations, seed data).
COPY backend ./backend

# ── runtime stage: slim image with the built node_modules + source ──
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    SEED_ON_BOOT=true \
    HOST=0.0.0.0 \
    PORT=4000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/backend ./backend
# workspace manifests so `npm run -w backend` resolves cleanly
COPY --from=build /app/web/customer-portal/package.json ./web/customer-portal/package.json
COPY --from=build /app/web/agent-portal/package.json ./web/agent-portal/package.json

EXPOSE 4000
# Runs migrations + (SEED_ON_BOOT) seed, then listens. tsx is a runtime dep.
CMD ["npm", "run", "start", "-w", "backend"]
