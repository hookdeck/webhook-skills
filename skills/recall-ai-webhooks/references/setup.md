# Setting Up Recall.ai Webhooks

## Prerequisites

- A Recall.ai account in one of the regions below
- A public HTTPS URL for your webhook endpoint (for local development, use the Hookdeck CLI tunnel below)

Recall.ai dashboards are regional. Use the one your account lives in:

| Region | Dashboard |
|--------|-----------|
| US (`us-east-1`) | https://us-east-1.recall.ai/dashboard |
| US pay-as-you-go (`us-west-2`) | https://us-west-2.recall.ai/dashboard |
| EU (`eu-central-1`) | https://eu-central-1.recall.ai/dashboard |
| JP (`ap-northeast-1`) | https://ap-northeast-1.recall.ai/dashboard |

## Which Secret Do I Need?

| Request type | Account created before 2025-12-15 | Account created on or after 2025-12-15 |
|--------------|-----------------------------------|----------------------------------------|
| Svix webhooks (bot, recording, transcript, calendar) | Svix endpoint signing secret; `svix-*` headers | Workspace verification secret; `webhook-*` headers |
| Real-time webhook endpoints, websockets, signed callbacks | Workspace verification secret; `webhook-*` headers | Workspace verification secret; `webhook-*` headers |

Both secrets are `whsec_`-prefixed and use the same algorithm. Put whichever applies in `RECALL_WEBHOOK_SECRET`. If a legacy account receives both kinds of request on one handler, it needs both secrets; try each in turn.

## Create the Workspace Verification Secret

1. Open **Developers → API Keys & Secrets** (`/dashboard/developers/api-keys` in your region).
2. Click **Create Workspace Secret** and copy the `whsec_...` value.

Recall.ai only adds the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers once this secret exists. If they're missing, you haven't created it yet.

## Legacy Svix Endpoint Signing Secret

On accounts created before 2025-12-15, open the **Webhooks** dashboard (`/dashboard/webhooks/`), select the endpoint, and copy its signing secret. Each endpoint has its own secret.

## Register a Svix Webhook Endpoint

1. Open the **Webhooks** dashboard for your region.
2. Add an endpoint with your URL, e.g. `https://your-app.com/webhooks/recall-ai`.
3. Subscribe to the events you need, for example `bot.done`, `bot.fatal`, `recording.done` and `transcript.done`. Unsubscribed events are not sent.

## Configure a Real-Time Webhook Endpoint

Real-time endpoints are set per bot on Create Bot, not in the dashboard:

```bash
curl --request POST \
  --url https://us-east-1.recall.ai/api/v1/bot/ \
  --header "Authorization: $RECALLAI_API_KEY" \
  --header 'content-type: application/json' \
  --data '{
    "meeting_url": "https://meet.google.com/abc-defg-hij",
    "recording_config": {
      "realtime_endpoints": [
        {
          "type": "webhook",
          "url": "https://your-app.com/webhooks/recall-ai",
          "events": ["participant_events.join", "participant_events.leave", "transcript.data"]
        }
      ]
    }
  }'
```

Real-time webhooks and websockets from the Desktop Recording SDK are not signed yet; async webhooks from the Desktop SDK are.

## Rotate the Secret

Rotating creates a new secret; the old one stays valid for 24 hours. During that window each request carries one signature per active secret, so your handler must accept any matching `v1` entry. A workspace can have at most 9 active secrets.

## Local Development

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 recall-ai --path /webhooks/recall-ai

# FastAPI
npx hookdeck-cli listen 8000 recall-ai --path /webhooks/recall-ai
```

No account required. Use the printed public URL as the endpoint URL above.

## IP Allowlisting

Svix webhooks come from [Svix's static IPs](https://docs.svix.com/receiving/source-ips). Real-time endpoints, websockets and callbacks don't use static IPs, so rely on signature verification.
