# Google Cloud setup (terminal)

LegalQ on Railway **does not** use gcloud. This is for your **email → Google Sheet** pipeline and **Zapier → Sheets**.

## One-command setup

In your Mac terminal:

```bash
cd /Users/harshitagarwal/Desktop/pratham/legalQ
chmod +x scripts/setup-gcloud.sh
bash scripts/setup-gcloud.sh
```

Optional env vars before running:

```bash
export GCP_PROJECT_ID="pratham-legalq"
export GCLOUD_ACCOUNT="you@prathaminternational.org"
bash scripts/setup-gcloud.sh
```

## What the script does

1. `gcloud auth login` (browser)
2. `gcloud auth application-default login`
3. Creates project `pratham-legalq` (or uses existing)
4. Enables **Google Sheets API** (+ optional Gmail API)
5. Creates OAuth brand / client where CLI supports it

## Manual steps still required (Console)

OAuth consent screen (Internal app) is easiest in the browser:

https://console.cloud.google.com/apis/credentials/consent

- User type: **Internal**
- Scopes: `spreadsheets`, `gmail.readonly` (if email sync reads inbox)

## Zapier

Zapier connects to Google Sheets via **Sign in with Google** in the Zap UI — you do not paste gcloud client secrets into LegalQ.

## LegalQ (Railway) — no Google env vars

Only: `ZAPIER_WEBHOOK_SECRET`, `RESEND_*`, `AUTH_*`, `DATABASE_URL`, `NEXTAUTH_*`
