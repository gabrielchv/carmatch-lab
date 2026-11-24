#!/usr/bin/env bash
# ──────────────────────────────────────────────
# CarMatch v1 — deploy to Google Cloud Run
# ──────────────────────────────────────────────
# Recreates the original service under the same project/region/service name, so
# the registered Google OAuth redirect URI and the GCS volume mounts keep
# working unchanged.
#
# Prerequisites:
#   - Billing ENABLED on the project. It is currently disabled, which is why
#     the service answers 503/500 ("billing is disabled for this project").
#     Enable it once with:
#         gcloud billing projects link carmatch-499019 \
#           --billing-account <ACCOUNT_ID>
#   - SESSION_SECRET exported in the environment (required by lib/auth.ts).
set -euo pipefail

PROJECT="${PROJECT:-carmatch-499019}"
REGION="${REGION:-southamerica-east1}"
SERVICE="${SERVICE:-carmatch}"

if [[ -z "${SESSION_SECRET:-}" ]]; then
  echo "✖ SESSION_SECRET is not set." >&2
  echo "  Generate one:  openssl rand -base64 32" >&2
  echo "  Then:          export SESSION_SECRET='...'" >&2
  exit 1
fi

echo "CarMatch v1 → Cloud Run"
echo "  project: ${PROJECT}"
echo "  region:  ${REGION}"
echo "  service: ${SERVICE}"

gcloud config set project "$PROJECT" >/dev/null

# Refuse before building anything, instead of failing halfway through.
if ! gcloud billing projects describe "$PROJECT" --format="value(billingEnabled)" | grep -qi true; then
  echo "✖ Billing is not enabled on ${PROJECT}." >&2
  echo "  Cloud Run cannot serve traffic until it is." >&2
  exit 1
fi

# The service already carries GOOGLE_CLIENT_ID/SECRET. --update-env-vars
# merges, so passing only SESSION_SECRET preserves them.
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --execution-environment gen2 \
  --add-volume "name=data,type=cloud-storage,bucket=carmatch-data-499019" \
  --add-volume-mount "volume=data,mount-path=/app/data" \
  --add-volume "name=uploads,type=cloud-storage,bucket=carmatch-uploads-499019" \
  --add-volume-mount "volume=uploads,mount-path=/app/public/uploads" \
  --update-env-vars "SESSION_SECRET=${SESSION_SECRET}" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300

url=$(gcloud run services describe "$SERVICE" --region "$REGION" --format="value(status.url)")
echo
echo "✓ deployed: ${url}"
