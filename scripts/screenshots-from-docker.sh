#!/usr/bin/env bash
# Build Mission Control from the current source tree, boot a fresh container
# with a synthetic admin and an empty data volume, capture all README panels
# against it, and tear down.
#
# Produces deterministic baselines because every run starts from the same
# clean state — no auto-discovered skills, no pre-existing agents/tasks, no
# claude session history. The seed step inside capture-screenshots.mjs adds
# 4 demo agents and 9 tasks so panels render meaningful content.
#
# Usage:
#   ./scripts/screenshots-from-docker.sh                # writes docs/*.png
#   ./scripts/screenshots-from-docker.sh --baseline     # writes docs/_captures/*.png
#   MC_DOCKER_PORT=3300 ./scripts/screenshots-from-docker.sh
#
# Requirements: docker (or compatible runtime), node 22+, pnpm, playwright deps.

set -euo pipefail

PORT="${MC_DOCKER_PORT:-3300}"
CONTAINER="mc-screenshots-$$"
IMAGE="mission-control:screenshots"
DATA_VOL="mc-screenshots-data-$$"

# Synthetic credentials. The image's seedAdminUserFromEnv writes these into
# users on first boot, then we discard them with the container.
AUTH_USER="screenshots-admin"
AUTH_PASS="$(openssl rand -hex 16)"
AUTH_SECRET="$(openssl rand -hex 32)"
API_KEY="$(openssl rand -hex 32)"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$DATA_VOL" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "[docker-shots] docker daemon not reachable. Start Docker Desktop / dockerd and retry." >&2
  exit 1
fi

# Pin to linux/amd64 so the container renders identically on every host —
# Apple Silicon Macs would otherwise produce arm64 Chromium output that
# differs from GHA ubuntu-x86_64 in sub-pixel font rendering. qemu adds
# a small build/runtime cost on arm64 but eliminates cross-arch render
# drift entirely.
PLATFORM="linux/amd64"

echo "[docker-shots] building image for ${PLATFORM} (~2 min cold, ~30s cached)..."
docker build --platform "$PLATFORM" -t "$IMAGE" .

echo "[docker-shots] starting container ${CONTAINER} on 127.0.0.1:${PORT}..."
docker volume create "$DATA_VOL" >/dev/null
docker run -d \
  --platform "$PLATFORM" \
  --name "$CONTAINER" \
  -p "127.0.0.1:${PORT}:3000" \
  -e AUTH_USER="$AUTH_USER" \
  -e AUTH_PASS="$AUTH_PASS" \
  -e AUTH_SECRET="$AUTH_SECRET" \
  -e API_KEY="$API_KEY" \
  -e NEXT_PUBLIC_GATEWAY_OPTIONAL=true \
  -v "$DATA_VOL":/app/.data \
  "$IMAGE" >/dev/null

echo "[docker-shots] waiting for /api/status?action=health ..."
ready=0
for _ in $(seq 1 90); do
  if curl -fs "http://127.0.0.1:${PORT}/api/status?action=health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "[docker-shots] container did not become healthy. Last logs:" >&2
  docker logs --tail 50 "$CONTAINER" >&2 || true
  exit 1
fi
echo "[docker-shots] container ready."

echo "[docker-shots] running capture-screenshots.mjs against the container..."
AUTH_USER="$AUTH_USER" AUTH_PASS="$AUTH_PASS" \
  MC_URL="http://127.0.0.1:${PORT}" \
  node scripts/capture-screenshots.mjs "$@"

echo "[docker-shots] done. Container + volume will be removed on exit."
