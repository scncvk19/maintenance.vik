#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  umask 077
  secret=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  printf 'POSTGRES_PASSWORD=%s\nAPP_PORT=3000\n' "$secret" > .env
fi
docker compose up -d --build --wait --wait-timeout 180
printf 'maintenance.vik ist bereit. Standardadresse: http://localhost:3000\n'
