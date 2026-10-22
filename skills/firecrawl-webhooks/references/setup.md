# Setting Up Firecrawl Webhooks

## Prerequisites

- Firecrawl account and API key
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 firecrawl --path /webhooks/firecrawl` during development)

## Get Your Webhook Secret

1. Open your Firecrawl account settings and go to the [Advanced tab](https://www.firecrawl.dev/app/settings?tab=advanced).
2. Copy the webhook secret. Each account has one secret that signs **all** its webhooks.
3. Store it as `FIRECRAWL_WEBHOOK_SECRET`. If it leaks, regenerate it from the same page.

## Attach a Webhook to a Job

Firecrawl webhooks are configured per request, not registered in a dashboard. Add a `webhook` object:

```bash
curl -X POST https://api.firecrawl.dev/v2/crawl \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{
    "url": "https://docs.firecrawl.dev",
    "limit": 100,
    "webhook": {
      "url": "https://your-domain.com/webhooks/firecrawl",
      "metadata": { "any_key": "any_value" },
      "events": ["started", "page", "completed"]
    }
  }'
```

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | Your HTTPS endpoint |
| `headers` | No | Custom headers added to each delivery |
| `metadata` | No | Echoed back in every payload's `metadata` |
| `events` | No | Event types to receive (default: all) |

The same `webhook` object works on `/v2/batch/scrape`, extract, and `/v2/agent` requests.

## Test Mode vs Live Mode

Firecrawl has no separate test mode. Run a small job (e.g. `"limit": 1`) against your tunnel URL to produce real signed events.
