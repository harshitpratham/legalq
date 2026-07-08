#!/usr/bin/env bash
# Pratham LegalQ — Google Cloud setup via gcloud CLI
# Run in your terminal (interactive): bash scripts/setup-gcloud.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-pratham-legalq}"
PROJECT_NAME="${GCP_PROJECT_NAME:-Pratham LegalQ}"
GCLOUD_ACCOUNT="${GCLOUD_ACCOUNT:-}"

echo "=== Pratham LegalQ — gcloud setup ==="
echo ""

# 1. Login (interactive — opens browser)
echo "Step 1: Authenticate with Google (use your Pratham / Workspace account)"
gcloud auth login
gcloud auth application-default login

if [[ -n "$GCLOUD_ACCOUNT" ]]; then
  gcloud config set account "$GCLOUD_ACCOUNT"
fi

echo ""
echo "Active account: $(gcloud config get-value account)"
echo ""

# 2. Create or select project
echo "Step 2: Project '$PROJECT_ID'"
if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
  echo "  Project already exists, using it."
else
  gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"
  echo "  Created project."
fi

gcloud config set project "$PROJECT_ID"
echo "  Active project: $(gcloud config get-value project)"
echo ""

# 3. Enable APIs (for Sheet + optional Gmail email→Sheet sync)
echo "Step 3: Enable APIs"
gcloud services enable sheets.googleapis.com --project="$PROJECT_ID"
echo "  ✓ Google Sheets API"

read -r -p "Enable Gmail API too? (for email→Sheet sync) [y/N]: " ENABLE_GMAIL
if [[ "$ENABLE_GMAIL" =~ ^[Yy]$ ]]; then
  gcloud services enable gmail.googleapis.com --project="$PROJECT_ID"
  echo "  ✓ Gmail API"
fi
echo ""

# 4. OAuth brand (required before OAuth client on some orgs)
echo "Step 4: OAuth brand (for API access / Zapier / scripts)"
BRAND_OUTPUT=$(gcloud alpha iap oauth-brands list --project="$PROJECT_ID" --format="value(name)" 2>/dev/null | head -1 || true)

if [[ -z "$BRAND_OUTPUT" ]]; then
  echo "  Creating OAuth brand..."
  SUPPORT_EMAIL=$(gcloud config get-value account)
  gcloud alpha iap oauth-brands create \
    --application_title="Pratham Legal Automation" \
    --support_email="$SUPPORT_EMAIL" \
    --project="$PROJECT_ID" 2>/dev/null || {
    echo "  Note: OAuth brand may need to be created in Console:"
    echo "  https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT_ID"
  }
else
  echo "  OAuth brand exists: $BRAND_OUTPUT"
fi
echo ""

# 5. OAuth client (for local scripts / custom integrations)
echo "Step 5: OAuth 2.0 Web client (optional — Zapier uses its own Google sign-in)"
BRAND=$(gcloud alpha iap oauth-brands list --project="$PROJECT_ID" --format="value(name)" 2>/dev/null | head -1 || true)

if [[ -n "$BRAND" ]]; then
  CLIENT_ID="legalq-web-client"
  REDIRECT_URIS="http://localhost:3333/oauth2callback,http://localhost:3000/api/auth/callback/google"

  if gcloud alpha iap oauth-clients describe "$CLIENT_ID" --brand="$BRAND" &>/dev/null 2>&1; then
    echo "  Client '$CLIENT_ID' already exists under brand."
  else
    gcloud alpha iap oauth-clients create "$CLIENT_ID" \
      --brand="$BRAND" \
      --display_name="LegalQ Web Client" \
      --redirect_uris="$REDIRECT_URIS" 2>/dev/null || {
      echo "  Create OAuth client manually in Console:"
      echo "  https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
      echo "  Redirect URIs: $REDIRECT_URIS"
    }
  fi
else
  echo "  Skip — create OAuth client in Console (link above)."
fi
echo ""

# 6. Summary
echo "=== Done ==="
echo ""
echo "Project ID:     $PROJECT_ID"
echo "Console:        https://console.cloud.google.com/home/dashboard?project=$PROJECT_ID"
echo "Credentials:    https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo "OAuth consent:  https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT_ID"
echo ""
echo "Next steps:"
echo "  1. OAuth consent screen → set User type to INTERNAL (Workspace)"
echo "  2. Add scopes: spreadsheets, gmail.readonly (if using Gmail sync)"
echo "  3. In Zapier: connect Google Sheets (uses Zapier's Google auth — no LegalQ gcloud needed)"
echo "  4. LegalQ on Railway does NOT need these credentials (Zapier + Resend only)"
echo ""
