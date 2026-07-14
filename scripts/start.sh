#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo ""
  echo "ERROR: DATABASE_URL is not set."
  echo ""
  echo "On Railway:"
  echo "  1. Add PostgreSQL to your project (+ New → Database → PostgreSQL)"
  echo "  2. Open your LegalQ service → Variables"
  echo "  3. Add variable: DATABASE_URL = \${{Postgres.DATABASE_URL}}"
  echo "     (use 'Add Reference' and pick your Postgres service → DATABASE_URL)"
  echo "  4. Redeploy"
  echo ""
  exit 1
fi

echo "Running database migrations..."
npx prisma migrate deploy

if [ -n "$CRON_SECRET" ]; then
  echo "Starting Gmail sync poller (every 3 min, in-container)..."
  (
    sleep 20
    while true; do
      curl -s -o /dev/null -w "" -X POST "http://127.0.0.1:${PORT:-3000}/api/cron/gmail-sync" \
        -H "Authorization: Bearer $CRON_SECRET" \
        --max-time 25
      sleep 180
    done
  ) &
else
  echo "WARNING: CRON_SECRET not set — Gmail sync poller disabled."
fi

echo "Starting LegalQ..."
exec npm start
