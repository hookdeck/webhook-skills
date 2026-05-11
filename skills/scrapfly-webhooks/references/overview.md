# Scrapfly Webhooks Overview

## What Are Scrapfly Webhooks?

Scrapfly is a web scraping API. When you submit a long-running job (async scrape, extraction, screenshot, or a Crawler run), Scrapfly delivers the result to a webhook endpoint you configure in the dashboard.

A webhook is identified by a **name** in the dashboard. You attach it to a request by passing `webhook_name=<name>` on the Scrape / Extraction / Screenshot API call, or by configuring it on the Crawler job. Scrapfly then POSTs the result (or, for the Crawler, lifecycle events) to your endpoint.

## Resource Types

The `X-Scrapfly-Webhook-Resource-Type` header tells you which product the delivery came from. Use it to dispatch when one endpoint handles multiple Scrapfly products:

| Resource Type | Triggered When | Common Use Cases |
|---------------|----------------|------------------|
| `scrape` | An async Scrape API job finishes | Save HTML / extracted fields, kick off downstream parsing |
| `extraction` | An async Extraction API job finishes | Persist structured data, enqueue follow-up enrichment |
| `screenshot` | An async Screenshot API job finishes | Store image URL, notify users, generate thumbnails |

The body of a `scrape` / `extraction` / `screenshot` webhook is the full JSON response of the corresponding synchronous API call with a `context` overlay added:

```json
{
  "...api_response": "...",
  "context": {
    "...api_context": "...",
    "webhook": {
      "name": "my-webhook",
      "secret": "<signing secret — DO NOT log>",
      "consecutive_failed_count": 0
    },
    "job": {
      "uuid": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

The webhook overlay always carries:

- `context.webhook.name` — webhook name configured in the dashboard
- `context.webhook.secret` — the signing secret (**never log or echo this field**)
- `context.webhook.consecutive_failed_count` — current consecutive-failure count
- `context.job.uuid` — job UUID (same value as `X-Scrapfly-Webhook-Job-Id`)

Product-specific fields (such as `result.content`, `result.data`, `result.screenshot_url`, or the API's own `context.url`) come from the underlying API response — see the [Scrape](https://scrapfly.io/docs/scrape-api/getting-started), [Extraction](https://scrapfly.io/docs/extraction-api/getting-started), and [Screenshot](https://scrapfly.io/docs/screenshot-api/getting-started) getting-started pages for shapes.

## Crawler Events

The Crawler API is a separate product that delivers **lifecycle events** rather than a single result. Each event has an `event` field in the body (and an `X-Scrapfly-Crawl-Event-Name` header):

| Event | Default? | Triggered When |
|-------|----------|----------------|
| `crawler_started` | Yes | Crawl job started |
| `crawler_stopped` | Yes | The crawl stopped (budget/limit reached) |
| `crawler_cancelled` | Yes | The crawl was cancelled |
| `crawler_finished` | Yes | The crawl ran to completion |
| `crawler_url_visited` | Opt-in | A URL was fetched successfully |
| `crawler_url_discovered` | Opt-in | A new URL was added to the queue |
| `crawler_url_skipped` | Opt-in | A URL was skipped (deduped, filtered) |
| `crawler_url_failed` | Opt-in | A URL fetch failed |

By default Scrapfly only delivers the four lifecycle events: `crawler_started`, `crawler_stopped`, `crawler_cancelled`, `crawler_finished`. The per-URL events (`crawler_url_visited`, `crawler_url_discovered`, `crawler_url_skipped`, `crawler_url_failed`) are high-volume and must be enabled explicitly via the `webhook_events` parameter when submitting the crawl job.

Example Crawler payload:

```json
{
  "event": "crawler_url_visited",
  "payload": {
    "crawler_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "url": "https://web-scraping.dev/page",
    "status_code": 200,
    "depth": 1,
    "state": {
      "urls_visited": 42,
      "urls_to_crawl": 158,
      "api_credit_used": 420
    }
  }
}
```

## Common Headers

| Header | Description |
|--------|-------------|
| `X-Scrapfly-Webhook-Signature` | HMAC-SHA256 of the raw body, **uppercase hex** |
| `X-Scrapfly-Webhook-Signature-Lowercase` | Same signature in lowercase hex |
| `X-Scrapfly-Webhook-Id` | Unique webhook delivery ID — use for idempotency |
| `X-Scrapfly-Webhook-Name` | Name of the webhook configured in the dashboard |
| `X-Scrapfly-Webhook-Resource-Type` | `scrape`, `extraction`, or `screenshot` |
| `X-Scrapfly-Webhook-Job-Id` | Job UUID returned at enqueue time — reconciliation key |
| `X-Scrapfly-Webhook-Env` | Environment label (`test` or `live`) |
| `X-Scrapfly-Webhook-Project` | Project name |
| `X-Scrapfly-Crawl-Event-Name` | Crawler API event name (e.g. `crawler_finished`) |
| `X-Scrapfly-Log-Uuid` / `X-Scrapfly-Log-Url` | Pointers to the Scrapfly log entry for the delivery |

## Delivery & Retries

Scrapfly delivery is **at-least-once**. Use `X-Scrapfly-Webhook-Job-Id` as your idempotency key — duplicates carry the same job UUID.

Retry schedule on non-2xx responses (or timeout):

| Attempt | Delay after previous |
|---------|----------------------|
| 1 | initial delivery |
| 2 | 30 s |
| 3 | 1 min |
| 4 | 5 min |
| 5 | 30 min |
| 6 | 1 h |
| 7 | 1 d |

After **100 consecutive failures** Scrapfly automatically **disables** the webhook — no further deliveries are attempted until you re-enable it in the dashboard. Because of this, handlers should:

- Return 2xx as soon as the signature is verified and the job is enqueued.
- Surface processing errors out-of-band (logs, alerts, dead-letter queue) rather than 5xx-ing back to Scrapfly.

## Full Event Reference

- [Scrape API webhook](https://scrapfly.io/docs/scrape-api/webhook)
- [Extraction API webhook](https://scrapfly.io/docs/extraction-api/webhook)
- [Screenshot API webhook](https://scrapfly.io/docs/screenshot-api/webhook)
- [Crawler API getting started](https://scrapfly.io/docs/crawler-api/getting-started)
