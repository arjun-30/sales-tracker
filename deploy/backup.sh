#!/bin/sh
# Nightly database backup; keeps the last 30 days. Install with cron, e.g.:
#   30 21 * * * /opt/paint-tracker/deploy/backup.sh >> /var/log/pt-backup.log 2>&1
# (21:30 UTC = 03:00 IST.) Copy the backups off this server as well (DEPLOY.md).
set -eu
cd "$(dirname "$0")"
. ./.env.production
BACKUP_DIR="${BACKUP_DIR:-/var/backups/paint-tracker}"
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/painttracker-$(date -u +%Y%m%d-%H%M).sql.gz"
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "$FILE"
find "$BACKUP_DIR" -name 'painttracker-*.sql.gz' -mtime +30 -delete
echo "$(date -u) backup written: $FILE ($(du -h "$FILE" | cut -f1))"
