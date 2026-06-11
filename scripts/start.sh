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

echo "Starting LegalQ..."
exec npm start
