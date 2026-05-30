#!/usr/bin/env bash
#
# Maslow CNC Studio — update to the latest version on a Raspberry Pi.
# Pulls the latest code, rebuilds, and restarts the service.
#
#   bash scripts/update.sh

set -euo pipefail

SERVICE="maslow-studio"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

echo "==> Pulling latest…"
git pull --ff-only

echo "==> Installing dependencies…"
if [ -f package-lock.json ]; then npm ci; else npm install; fi

echo "==> Building…"
npm run build

if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE}.service"; then
  echo "==> Restarting ${SERVICE}…"
  sudo systemctl restart "${SERVICE}"
  echo "==> Updated. Logs: journalctl -u ${SERVICE} -f"
else
  echo "==> Built. (Service '${SERVICE}' not installed — run scripts/install.sh first.)"
fi
