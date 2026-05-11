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

The body of a `scrape` / `extraction` / `screenshot` webhook is the same JSON envelope you'd get from the synchronous API call, with extra webhook context (`webhook_name`, `webhook_uuid`, `job_uuid`).

## Crawler Events

The Crawler API is a separate product that delivers **lifecycle events** rather than a single result. Each event has an `event` field in the body (and an `X-Scrapfly-Crawl-Event-Name` header):

| Event | Triggered When |
|-------|----------------|
| `crawler_started` | Crawl job started |
| `crawler_url_visited` | A URL was fetched successfully |
| `crawler_url_discovered` | A new URL was added to the queue |
| `crawler_url_skipped` | A URL was skipped (deduped, filtered) |
| `crawler_url_failed` | A URL fetch failed |
| `crawler_stopped` | The crawl stopped (budget/limit reached) |
| `crawler_cancelled` | The crawl was cancelled |
| `crawler_finished` | The crawl ran to completion |

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
| `X-Scrapfly-Webhook-Env` | Environment label (e.g. `production`) |
| `X-Scrapfly-Webhook-Project` | Project name |
| `X-Scrapfly-Crawl-Event-Name` | Crawler API event name (e.g. `crawler_finished`) |
| `X-Scrapfly-Log-Uuid` / `X-Scrapfly-Log-Url` | Pointers to the Scrapfly log entry for the delivery |

## Full Event Reference

- [Scrape API webhook](https://scrapfly.io/docs/scrape-api/webhook)
- [Extraction API webhook](https://scrapfly.io/docs/extraction-api/webhook)
- [Screenshot API webhook](https://scrapfly.io/docs/screenshot-api/webhook)
- [Crawler API getting started](https://scrapfly.io/docs/crawler-api/getting-started)
