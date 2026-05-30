#!/usr/bin/env bash
#
# Maslow CNC Studio — Raspberry Pi installer.
#
# Builds the app and installs a systemd service that serves it on boot.
# The app is a static site that talks to the Maslow over WebSocket straight
# from the browser, so the Pi only needs to host the built files — no backend.
#
# Idempotent: safe to re-run. Re-run after a `git pull` to rebuild, or just use
# scripts/update.sh.
#
# Usage:
#   bash scripts/install.sh                # serve on port 8080
#   PORT=80 bash scripts/install.sh        # serve on port 80
#
# Tested for Raspberry Pi OS / Debian (apt + systemd). NOT yet validated on
# physical hardware — review before trusting it on a machine that cuts.

set -euo pipefail

PORT="${PORT:-8080}"
SERVICE="maslow-studio"
NODE_MAJOR_MIN=20

# Resolve the repo root (this script lives in <repo>/scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Run the build/service as the real user, even when invoked with sudo.
RUN_USER="${SUDO_USER:-$(id -un)}"

echo "==> Maslow CNC Studio installer"
echo "    repo:    ${REPO_DIR}"
echo "    user:    ${RUN_USER}"
echo "    port:    ${PORT}"

# --- 1. Node.js -------------------------------------------------------------
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "${major}" -ge "${NODE_MAJOR_MIN}" ]; then need_node=0; fi
fi

if [ "${need_node}" -eq 1 ]; then
  echo "==> Installing Node.js ${NODE_MAJOR_MIN}.x (NodeSource)…"
  if ! command -v curl >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y curl; fi
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR_MIN}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "==> Node $(node -v) already present — skipping install"
fi

# --- 2. Build ---------------------------------------------------------------
cd "${REPO_DIR}"
echo "==> Installing dependencies…"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
echo "==> Building…"
npm run build

# --- 3. systemd service -----------------------------------------------------
NODE_BIN="$(command -v node)"
UNIT="/etc/systemd/system/${SERVICE}.service"
echo "==> Writing ${UNIT}"
sudo tee "${UNIT}" >/dev/null <<EOF
[Unit]
Description=Maslow CNC Studio (static web app)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${REPO_DIR}
Environment=PORT=${PORT}
Environment=HOST=0.0.0.0
ExecStart=${NODE_BIN} ${REPO_DIR}/scripts/serve.mjs
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "==> Enabling + starting service"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE}"
sudo systemctl restart "${SERVICE}"

# --- 4. Done ----------------------------------------------------------------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "==> Done. Maslow CNC Studio is running."
echo "    On this Pi:        http://localhost:${PORT}"
[ -n "${IP}" ] && echo "    On your network:   http://${IP}:${PORT}"
echo ""
echo "    Status:  sudo systemctl status ${SERVICE}"
echo "    Logs:    journalctl -u ${SERVICE} -f"
echo "    Update:  bash scripts/update.sh"
