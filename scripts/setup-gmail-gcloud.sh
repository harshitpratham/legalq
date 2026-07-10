#!/usr/bin/env bash
# LegalQ — Gmail API + service account setup via gcloud
# Run from repo root: bash scripts/setup-gmail-gcloud.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-legalq-498409}"
SA_NAME="${GMAIL_SA_NAME:-legalq-gmail-sender}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_PATH="${GMAIL_KEY_PATH:-.secrets/${SA_NAME}.json}"
GMAIL_SEND_AS="${GMAIL_SEND_AS:-legal@prathaminternational.org}"
SCOPE="https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.readonly"

echo "==> Using project: ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}" >/dev/null

echo "==> Enabling Gmail API..."
gcloud services enable gmail.googleapis.com --project="${PROJECT_ID}"

if ! gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "==> Creating service account ${SA_NAME}..."
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="LegalQ Gmail Sender" \
    --description="Sends outbound email as ${GMAIL_SEND_AS} via Gmail API" \
    --project="${PROJECT_ID}"
else
  echo "==> Service account already exists: ${SA_EMAIL}"
fi

mkdir -p "$(dirname "${KEY_PATH}")"
if [[ -f "${KEY_PATH}" ]]; then
  echo "==> Key file already exists at ${KEY_PATH} (skipping new key creation)"
else
  echo "==> Creating service account key at ${KEY_PATH}..."
  gcloud iam service-accounts keys create "${KEY_PATH}" \
    --iam-account="${SA_EMAIL}" \
    --project="${PROJECT_ID}"
fi

CLIENT_ID="$(gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" --format='value(uniqueId)')"

echo ""
echo "=== GCP setup complete ==="
echo "Service account: ${SA_EMAIL}"
echo "Client ID:       ${CLIENT_ID}"
echo "Key file:        ${KEY_PATH}"
echo "Send as:         ${GMAIL_SEND_AS}"
echo ""
echo "=== One manual step (Workspace Super Admin) ==="
echo "1. Open: https://admin.google.com/ac/owl/domainwidedelegation"
echo "2. Add new → Client ID: ${CLIENT_ID}"
echo "3. OAuth scopes (comma-separated on one line):"
echo "   https://www.googleapis.com/auth/gmail.send"
echo "   https://www.googleapis.com/auth/gmail.readonly"
echo "4. Authorize"
echo ""
echo "=== Railway env var ==="
echo "Set GOOGLE_SERVICE_ACCOUNT_JSON to the full contents of:"
echo "  ${KEY_PATH}"
echo ""
echo "Also set:"
echo "  GMAIL_SEND_AS=${GMAIL_SEND_AS}"
echo "  GMAIL_FROM_NAME=Pratham Legal"
echo ""
echo "Quick copy for Railway (minified JSON):"
python3 - <<'PY' "${KEY_PATH}" 2>/dev/null || cat "${KEY_PATH}"
import json, sys
with open(sys.argv[1]) as f:
    print(json.dumps(json.load(f)))
PY
