#!/usr/bin/env bash
# LegalQ — Gmail Pub/Sub push setup for inbound email
# Run from repo root: bash scripts/setup-gmail-pubsub.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-legalq-498409}"
TOPIC_ID="${GMAIL_PUBSUB_TOPIC_ID:-legalq-gmail-inbox}"
SUBSCRIPTION_ID="${GMAIL_PUBSUB_SUBSCRIPTION_ID:-legalq-gmail-inbox-push}"
PUSH_ENDPOINT="${GMAIL_PUSH_ENDPOINT:-https://legalq-production.up.railway.app/api/webhooks/gmail}"
GMAIL_PUSH_SA="service-$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')@gcp-sa-pubsub.iam.gserviceaccount.com"

echo "==> Using project: ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}" >/dev/null

echo "==> Enabling Pub/Sub API..."
gcloud services enable pubsub.googleapis.com --project="${PROJECT_ID}"

echo "==> Enabling Gmail API (if not already)..."
gcloud services enable gmail.googleapis.com --project="${PROJECT_ID}"

if ! gcloud pubsub topics describe "${TOPIC_ID}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "==> Creating topic ${TOPIC_ID}..."
  gcloud pubsub topics create "${TOPIC_ID}" --project="${PROJECT_ID}"
else
  echo "==> Topic already exists: ${TOPIC_ID}"
fi

echo "==> Granting Gmail API publish permission on topic..."
gcloud pubsub topics add-iam-policy-binding "${TOPIC_ID}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --quiet

if ! gcloud pubsub subscriptions describe "${SUBSCRIPTION_ID}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "==> Creating push subscription ${SUBSCRIPTION_ID}..."
  gcloud pubsub subscriptions create "${SUBSCRIPTION_ID}" \
    --project="${PROJECT_ID}" \
    --topic="${TOPIC_ID}" \
    --push-endpoint="${PUSH_ENDPOINT}" \
    --ack-deadline=30
else
  echo "==> Updating push subscription endpoint..."
  gcloud pubsub subscriptions update "${SUBSCRIPTION_ID}" \
    --project="${PROJECT_ID}" \
    --push-endpoint="${PUSH_ENDPOINT}"
fi

echo ""
echo "=== Pub/Sub setup complete ==="
echo "Topic:        projects/${PROJECT_ID}/topics/${TOPIC_ID}"
echo "Subscription: ${SUBSCRIPTION_ID}"
echo "Push URL:     ${PUSH_ENDPOINT}"
echo ""
echo "=== Railway env vars ==="
echo "GMAIL_PUBSUB_TOPIC=projects/${PROJECT_ID}/topics/${TOPIC_ID}"
echo "GMAIL_INBOX_EMAIL=legal@prathaminternational.org"
echo "CRON_SECRET=<generate-a-random-secret>"
echo ""
echo "=== Workspace Admin (manual) ==="
echo "Update domain-wide delegation for client ID 117053953603379110562:"
echo "  https://www.googleapis.com/auth/gmail.send"
echo "  https://www.googleapis.com/auth/gmail.readonly"
echo ""
echo "=== After deploy ==="
echo "1. Set env vars on Railway"
echo "2. POST /api/cron/gmail-watch with Authorization: Bearer <CRON_SECRET>"
echo "3. Add Railway cron job for watch renewal every 6 days"
