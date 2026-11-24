#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# CarMatch — Deploy Script
# ──────────────────────────────────────────────
# Deploys the current codebase to Google Cloud Run
# while preserving existing volume mounts and env vars.
# ──────────────────────────────────────────────

PROJECT="carmatch-499019"
REGION="southamerica-east1"
SERVICE="carmatch"

echo "🚀 CarMatch Deploy"
echo "=================="
echo ""
echo "  Project:  ${PROJECT}"
echo "  Region:   ${REGION}"
echo "  Service:  ${SERVICE}"
echo ""

# ── Check git status ──
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  echo "⚠️  You have uncommitted changes:"
  git status --short
  echo ""
  read -rp "Deploy with uncommitted changes? (y/N) " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "❌ Cancelled."
    exit 1
  fi
fi

# ── Ensure we're on the right project ──
current="$(gcloud config get project 2>/dev/null || true)"
if [[ "$current" != "$PROJECT" ]]; then
  echo "📌 Setting project to ${PROJECT}..."
  gcloud config set project "$PROJECT"
fi

# ── Deploy to Cloud Run ──
echo ""
echo "📦 Deploying to Cloud Run..."
echo ""

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION"

echo ""
echo "✅ Deploy complete!"
echo ""

# ── Show the URL ──
url=$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --format="value(status.url)" 2>/dev/null || true)

if [[ -n "$url" ]]; then
  echo "   🌐  ${url}"
fi
echo ""
