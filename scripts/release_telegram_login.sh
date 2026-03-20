#!/usr/bin/env bash
set -euo pipefail

# Telegram login release helper
# Usage:
#   bash scripts/release_telegram_login.sh all
#   bash scripts/release_telegram_login.sh db
#   bash scripts/release_telegram_login.sh verify-db
#   bash scripts/release_telegram_login.sh build-frontend
#   bash scripts/release_telegram_login.sh health

STEP="${1:-all}"

WORKSPACE_DIR="${WORKSPACE_DIR:-/data/jenkins_home/workspace/onechain-games/oneplay-ninja-frontend}"
NODE_IMAGE="${NODE_IMAGE:-harbor.onelabs.cc/base-images/node:22-pnpm}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://localhost:3001/api/health}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

run_db_migration() {
  require_cmd psql

  if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
    fail "SUPABASE_DB_URL is required for DB migration (example: postgresql://user:pass@host:5432/postgres?sslmode=require)"
  fi

  log "Running Telegram login migration on production DB..."
  psql "$SUPABASE_DB_URL" <<'SQL'
ALTER TABLE players ADD COLUMN IF NOT EXISTS telegram_user_id TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'wallet';
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_telegram_user_id
  ON players(telegram_user_id) WHERE telegram_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_players_auth_provider ON players(auth_provider);
SQL
  log "DB migration completed."
}

verify_db_migration() {
  require_cmd psql

  if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
    fail "SUPABASE_DB_URL is required for DB verification."
  fi

  log "Verifying columns..."
  psql "$SUPABASE_DB_URL" -c "
select column_name, data_type
from information_schema.columns
where table_name='players'
  and column_name in ('telegram_user_id','auth_provider','avatar_url')
order by column_name;"

  log "Verifying indexes..."
  psql "$SUPABASE_DB_URL" -c "
select indexname
from pg_indexes
where tablename='players'
  and indexname in ('idx_players_telegram_user_id','idx_players_auth_provider')
order by indexname;"

  log "DB verification completed."
}

check_backend_env() {
  local required_vars=(
    TELEGRAM_BOT_TOKEN
    JWT_SECRET
    JWT_REFRESH_SECRET
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
  )

  local missing=0
  for v in "${required_vars[@]}"; do
    if [[ -z "${!v:-}" ]]; then
      log "Missing env: $v"
      missing=1
    fi
  done

  if [[ "$missing" -eq 1 ]]; then
    fail "Backend env check failed. Export missing variables before deployment."
  fi

  log "Backend env check passed."
}

build_frontend() {
  require_cmd docker

  [[ -d "$WORKSPACE_DIR" ]] || fail "WORKSPACE_DIR does not exist: $WORKSPACE_DIR"

  log "Building frontend using Docker image: $NODE_IMAGE"
  docker run --rm \
    -v "$WORKSPACE_DIR:/build" \
    "$NODE_IMAGE" \
    bash -c "cd /build && pnpm install && pnpm run build"

  log "Frontend build completed."
}

health_check() {
  require_cmd curl

  log "Checking backend health: $BACKEND_HEALTH_URL"
  curl --fail --silent --show-error "$BACKEND_HEALTH_URL" >/dev/null
  log "Backend health check passed."
}

run_all() {
  log "=== Telegram login release start ==="
  run_db_migration
  verify_db_migration
  check_backend_env
  build_frontend
  health_check
  log "=== Telegram login release finished ==="
}

case "$STEP" in
  db)
    run_db_migration
    ;;
  verify-db)
    verify_db_migration
    ;;
  check-backend-env)
    check_backend_env
    ;;
  build-frontend)
    build_frontend
    ;;
  health)
    health_check
    ;;
  all)
    run_all
    ;;
  *)
    cat <<'USAGE'
Usage:
  bash scripts/release_telegram_login.sh all
  bash scripts/release_telegram_login.sh db
  bash scripts/release_telegram_login.sh verify-db
  bash scripts/release_telegram_login.sh check-backend-env
  bash scripts/release_telegram_login.sh build-frontend
  bash scripts/release_telegram_login.sh health

Required env for DB actions:
  SUPABASE_DB_URL

Optional env:
  WORKSPACE_DIR      (default: /data/jenkins_home/workspace/onechain-games/oneplay-ninja-frontend)
  NODE_IMAGE         (default: harbor.onelabs.cc/base-images/node:22-pnpm)
  BACKEND_HEALTH_URL (default: http://localhost:3001/api/health)
USAGE
    exit 1
    ;;
esac
