#!/usr/bin/env bash
# Build locally and ship a release to the GCE VM, then restart the service.
#   scripts/deploy.sh            (uses the defaults below; override with env vars)
# Note: rooms are in memory — a deploy ends running games.
set -euo pipefail
cd "$(dirname "$0")/.."

VM="${COUP_VM:-instance-20260916-072852}"
ZONE="${COUP_ZONE:-asia-southeast1-b}"
PROJECT="${COUP_PROJECT:-hermes-agent-01-508807}"
KEEP="${COUP_KEEP_RELEASES:-3}"
REL="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
TARBALL="/tmp/coup3d-${REL}.tgz"

echo "==> building ${REL}"
npm run build
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$TARBALL" dist package.json package-lock.json

echo "==> uploading"
gcloud compute scp "$TARBALL" "${VM}:/tmp/coup3d.tgz" --zone "$ZONE" --project "$PROJECT"

echo "==> installing on ${VM}"
gcloud compute ssh "$VM" --zone "$ZONE" --project "$PROJECT" --command "set -euo pipefail
  D=/opt/coup3d/releases/${REL}
  sudo mkdir -p \$D && sudo tar -xzf /tmp/coup3d.tgz -C \$D && rm /tmp/coup3d.tgz
  cd \$D && sudo npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
  sudo ln -sfn \$D /opt/coup3d/current
  sudo chown -R coup3d:coup3d /opt/coup3d
  sudo systemctl restart coup3d
  sleep 2 && systemctl is-active coup3d && curl -fsS http://127.0.0.1:3000/healthz && echo
  ls -1dt /opt/coup3d/releases/* | tail -n +$((KEEP + 1)) | xargs -r sudo rm -rf"
rm -f "$TARBALL"
echo "==> deployed ${REL}"
