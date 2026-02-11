# syntax=docker/dockerfile:1
FROM oven/bun:debian

# Install system deps with cache mount
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt update && apt install -y --no-install-recommends \
    default-jdk git ca-certificates bash sqlite3

WORKDIR /opt/server

# === DEPENDENCY LAYER (cached unless package files change) ===

# Copy only package files first
COPY engine/package.json engine/bun.lock /opt/server/engine/
COPY gateway/package.json gateway/bun.lock /opt/server/gateway/

# Install engine deps with bun cache mount
WORKDIR /opt/server/engine
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install

# Install gateway deps with bun cache mount
WORKDIR /opt/server/gateway
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install

# === SOURCE LAYER (rebuilds on code changes, but deps cached) ===

WORKDIR /opt/server

# Copy source code
COPY content /opt/server/content
COPY webclient /opt/server/webclient
COPY engine /opt/server/engine
COPY gateway /opt/server/gateway
COPY sdk /opt/sdk

# Patch and build engine
WORKDIR /opt/server/engine
RUN [ -f .env ] || cp .env.example .env && \
    sed -i 's/port: Environment.WEB_PORT,/port: Environment.WEB_PORT, hostname: "0.0.0.0",/' src/web/index.ts && \
    bun run build

# Patch gateway
WORKDIR /opt/server/gateway
RUN sed -i 's/port: GATEWAY_PORT,/port: GATEWAY_PORT, hostname: "0.0.0.0",/' gateway.ts

WORKDIR /opt/server

EXPOSE 8080/tcp
EXPOSE 43594/tcp
EXPOSE 7780/tcp

# Entrypoint script to ensure persistent data is on the volume
COPY --chmod=755 <<'EOF' /opt/server/entrypoint.sh
#!/bin/bash
set -e

# === DATABASE ===
# Symlink db.sqlite to persistent volume
if [ ! -L /opt/server/engine/db.sqlite ]; then
    rm -f /opt/server/engine/db.sqlite
    ln -s /opt/server/data/db.sqlite /opt/server/engine/db.sqlite
fi

# Run migrations (idempotent - only applies pending migrations)
echo "Running database migrations..."
cd /opt/server/engine && bun run sqlite:migrate

# === PLAYER SAVES ===
# Create players directory on volume if it doesn't exist
mkdir -p /opt/server/data/players

# If there are existing player saves in ephemeral storage, move them to volume
if [ -d /opt/server/engine/data/players ] && [ ! -L /opt/server/engine/data/players ]; then
    # Copy any existing saves to volume (won't overwrite existing)
    cp -rn /opt/server/engine/data/players/* /opt/server/data/players/ 2>/dev/null || true
    rm -rf /opt/server/engine/data/players
fi

# Create symlink for player saves
mkdir -p /opt/server/engine/data
if [ ! -L /opt/server/engine/data/players ]; then
    rm -rf /opt/server/engine/data/players
    ln -s /opt/server/data/players /opt/server/engine/data/players
fi

# === START GATEWAY SERVICE ===
echo "Starting gateway service on port 7780..."
cd /opt/server/gateway && bun run gateway.ts &

# === START GAME SERVER ===
cd /opt/server/engine
exec bun run src/app.ts
EOF

CMD ["/opt/server/entrypoint.sh"]
