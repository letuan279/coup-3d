#!/usr/bin/env bash
# One-time VM provisioning (Debian/Ubuntu). Run on the VM as a sudo-capable user:
#   COUP_DOMAIN=example.com bash setup-vm.sh
set -euo pipefail
: "${COUP_DOMAIN:?set COUP_DOMAIN (e.g. 34-177-105-194.sslip.io)}"

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https

# Node.js 22 (NodeSource)
if ! command -v node >/dev/null || ! node -v | grep -qE '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Caddy (official repo)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

# Service user + directories
id coup3d >/dev/null 2>&1 || sudo useradd --system --home /opt/coup3d --shell /usr/sbin/nologin coup3d
sudo mkdir -p /opt/coup3d/releases

# Caddy config
echo "COUP_DOMAIN=${COUP_DOMAIN}" | sudo tee /etc/default/caddy >/dev/null
sudo mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/default/caddy\n' | sudo tee /etc/systemd/system/caddy.service.d/env.conf >/dev/null
sudo install -m 644 "$(dirname "$0")/Caddyfile" /etc/caddy/Caddyfile

# Game service
sudo install -m 644 "$(dirname "$0")/coup3d.service" /etc/systemd/system/coup3d.service
sudo systemctl daemon-reload
sudo systemctl enable caddy coup3d
sudo systemctl restart caddy
echo "VM ready. Deploy a release with scripts/deploy.sh from your machine."
