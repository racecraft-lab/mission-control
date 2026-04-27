#!/usr/bin/env bash
# Build Mission Control from the current source tree, boot a disposable
# production containers with deterministic credentials and host-mounted data
# directories, then run Playwright against those containers.
#
# The host-mounted data directories are intentional: the default run validates a
# clean flag-off container first, then seeds FEATURE_WORKSPACE_SWITCHER into a
# fresh mounted SQLite database before running the flag-on Product Line journey.
#
# Usage:
#   bash scripts/e2e-docker.sh
#   bash scripts/e2e-docker.sh tests/product-line-switcher-ui.spec.ts
#   MC_E2E_DOCKER_PORT=3310 bash scripts/e2e-docker.sh
#   MC_E2E_DOCKER_PRESEED=0 bash scripts/e2e-docker.sh tests/workspace-switcher-flag-off.spec.ts

set -euo pipefail

PORT="${MC_E2E_DOCKER_PORT:-3301}"
CONTAINER_PREFIX="mc-e2e-$$"
IMAGE="${MC_E2E_IMAGE:-mission-control:e2e}"
AUTH_USER="${AUTH_USER:-testadmin}"
AUTH_PASS="${AUTH_PASS:-testpass1234!}"
AUTH_SECRET="${AUTH_SECRET:-e2e-auth-secret-00000000000000000000000000000000}"
API_KEY="${API_KEY:-test-api-key-e2e-12345}"
CONTAINERS=()
DATA_DIRS=()

cleanup() {
  for container in "${CONTAINERS[@]}"; do
    docker rm -f "$container" >/dev/null 2>&1 || true
  done
  for data_dir in "${DATA_DIRS[@]}"; do
    rm -rf "$data_dir"
  done
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "[e2e-docker] docker daemon not reachable. Start Docker Desktop / dockerd and retry." >&2
  exit 1
fi

create_data_dir() {
  local data_dir
  data_dir="$(mktemp -d "${TMPDIR:-/tmp}/mc-e2e-data.XXXXXX")"
  chmod 0777 "$data_dir"
  printf '%s\n' "$data_dir"
}

wait_for_health() {
  local container="$1"
  local ready=0
  for _ in $(seq 1 120); do
    if curl -fs "http://127.0.0.1:${PORT}/api/status?action=health" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    echo "[e2e-docker] container did not become healthy. Last logs:" >&2
    docker logs --tail 80 "$container" >&2 || true
    exit 1
  fi
}

start_container() {
  local container="$1"
  local data_dir="$2"

  echo "[e2e-docker] starting container ${container} on 127.0.0.1:${PORT}..."
  docker run -d \
    --name "$container" \
    -p "127.0.0.1:${PORT}:3000" \
    -e AUTH_USER="$AUTH_USER" \
    -e AUTH_PASS="$AUTH_PASS" \
    -e AUTH_SECRET="$AUTH_SECRET" \
    -e API_KEY="$API_KEY" \
    -e MISSION_CONTROL_TEST_MODE=1 \
    -e MC_DISABLE_RATE_LIMIT=1 \
    -e MC_WORKLOAD_QUEUE_DEPTH_THROTTLE=1000 \
    -e MC_WORKLOAD_QUEUE_DEPTH_SHED=2000 \
    -e MC_WORKLOAD_ERROR_RATE_THROTTLE=1 \
    -e MC_WORKLOAD_ERROR_RATE_SHED=1 \
    -e NEXT_PUBLIC_GATEWAY_OPTIONAL=true \
    -v "$data_dir":/app/.data \
    "$IMAGE" >/dev/null
  CONTAINERS+=("$container")
  echo "[e2e-docker] waiting for /api/status?action=health ..."
  wait_for_health "$container"
}

run_playwright() {
  local data_dir="$1"
  local preseeded="$2"
  shift 2

  AUTH_USER="$AUTH_USER" \
  AUTH_PASS="$AUTH_PASS" \
  API_KEY="$API_KEY" \
  SPEC002_SCREENSHOTS="${SPEC002_SCREENSHOTS:-1}" \
  MC_E2E_WORKSPACE_SWITCHER_PRESEEDED="$preseeded" \
  E2E_BASE_URL="http://127.0.0.1:${PORT}" \
  MISSION_CONTROL_DB_PATH="$data_dir/mission-control.db" \
  pnpm exec playwright test -c playwright.docker.config.ts "$@"
}

echo "[e2e-docker] building image ${IMAGE}..."
docker build -t "$IMAGE" .

if [ "$#" -eq 0 ]; then
  FLAG_OFF_DATA_DIR="$(create_data_dir)"
  DATA_DIRS+=("$FLAG_OFF_DATA_DIR")
  FLAG_OFF_CONTAINER="${CONTAINER_PREFIX}-off"
  start_container "$FLAG_OFF_CONTAINER" "$FLAG_OFF_DATA_DIR"

  echo "[e2e-docker] running clean flag-off regression suite."
  run_playwright "$FLAG_OFF_DATA_DIR" 0 tests/workspace-switcher-flag-off.spec.ts

  docker rm -f "$FLAG_OFF_CONTAINER" >/dev/null

  FLAG_ON_DATA_DIR="$(create_data_dir)"
  DATA_DIRS+=("$FLAG_ON_DATA_DIR")
  FLAG_ON_CONTAINER="${CONTAINER_PREFIX}-on"
  start_container "$FLAG_ON_CONTAINER" "$FLAG_ON_DATA_DIR"

  echo "[e2e-docker] seeding workspace-switcher flag in mounted database..."
  MISSION_CONTROL_DB_PATH="$FLAG_ON_DATA_DIR/mission-control.db" node scripts/seed-e2e-workspace-switcher.cjs

  echo "[e2e-docker] restarting container so seeded database state is read at boot..."
  docker restart "$FLAG_ON_CONTAINER" >/dev/null
  wait_for_health "$FLAG_ON_CONTAINER"

  echo "[e2e-docker] running seeded Product Line e2e suite."
  run_playwright "$FLAG_ON_DATA_DIR" 1 \
    tests/product-line-switcher-ui.spec.ts \
    tests/product-line-scope-api.spec.ts \
    tests/product-line-scope-matrix.spec.ts \
    tests/product-line-events.spec.ts
else
  DATA_DIR="$(create_data_dir)"
  DATA_DIRS+=("$DATA_DIR")
  CONTAINER="${CONTAINER_PREFIX}-custom"
  start_container "$CONTAINER" "$DATA_DIR"

  if [ "${MC_E2E_DOCKER_PRESEED:-1}" = "1" ]; then
    echo "[e2e-docker] seeding workspace-switcher flag in mounted database..."
    MISSION_CONTROL_DB_PATH="$DATA_DIR/mission-control.db" node scripts/seed-e2e-workspace-switcher.cjs
    echo "[e2e-docker] restarting container so seeded database state is read at boot..."
    docker restart "$CONTAINER" >/dev/null
    wait_for_health "$CONTAINER"
    PRESEEDED=1
  else
    PRESEEDED=0
  fi

  echo "[e2e-docker] container ready; running Playwright."
  run_playwright "$DATA_DIR" "$PRESEEDED" "$@"
fi

echo "[e2e-docker] done. Container and data directory will be removed."
