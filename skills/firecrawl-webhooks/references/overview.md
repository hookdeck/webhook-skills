# Firecrawl Webhooks Overview

## What Are Firecrawl Webhooks?

Firecrawl is a web scraping API. Instead of polling a job's status, add a `webhook` object to a crawl, batch scrape, extract, or agent request (or a monitor) and Firecrawl POSTs events to your HTTPS endpoint as the job starts, scrapes pages, and finishes. Each request is signed with `X-Firecrawl-Signature`.

## Common Event Types

The event name is in the payload's `type` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `crawl.started` | Crawl job begins processing | Mark job as running |
| `crawl.page` | A page is scraped during a crawl | Stream pages into a store or index |
| `crawl.completed` | Crawl finishes and all pages are processed | Finalize, notify, start downstream work |
| `batch_scrape.started` | Batch scrape job begins | Mark job as running |
| `batch_scrape.page` | A URL is scraped during a batch scrape | Store each result |
| `batch_scrape.completed` | All URLs in the batch are processed | Finalize the batch |
| `extract.started` | Extract job begins | Mark job as running |
| `extract.completed` | Extraction finishes successfully | Save structured data |
| `extract.failed` | Extraction fails | Alert, retry the job |
| `agent.started` | Agent job begins | Mark job as running |
| `agent.action` | Agent executes a tool (scrape, search, etc.) | Progress and credit tracking |
| `agent.completed` | Agent finishes successfully | Save agent output |
| `agent.failed` | Agent hits an error | Alert, inspect `error` |
| `agent.cancelled` | Agent job cancelled by the user | Clean up |
| `monitor.page` | A monitored page scrape finishes | React to page changes |
| `monitor.check.completed` | Monitor check finishes | Summary of changes |

The `events` filter in the webhook config uses the short names (`started`, `page`, `completed`, `failed`); the payload `type` is prefixed with the operation. The docs list no `failed` event for crawl or batch scrape, so handle unknown types with a default branch.

## Event Payload Structure

```json
{
  "success": true,
  "type": "crawl.page",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "webhookId": "f1e2d3c4-0000-0000-0000-000000000003",
  "data": [
    {
      "markdown": "# Page content...",
      "metadata": { "title": "Page Title", "url": "https://example.com/page", "statusCode": 200 }
    }
  ],
  "metadata": {}
}
```

| Field | Description |
|-------|-------------|
| `success` | Whether the operation succeeded |
| `type` | Event type, e.g. `crawl.page` |
| `id` | Job ID |
| `webhookId` | Unique ID for this delivery (crawl, batch scrape, extract, monitor events; not agent events). Useful for idempotency |
| `data` | Array of event-specific data (empty for `*.started` and `crawl.completed`) |
| `metadata` | Custom metadata from your webhook config |
| `error` | Error message when `success` is `false` |

## Delivery and Retries

Your endpoint must return a `2xx` within **10 seconds**. On a timeout, non-2xx, or network error Firecrawl retries after 1 minute, 5 minutes, then 15 minutes; after 3 failed retries the webhook is marked failed. Acknowledge fast and process asynchronously, and dedupe on `webhookId`.

## Full Event Reference

For the complete list of events and payloads, see [Firecrawl's event types documentation](https://docs.firecrawl.dev/webhooks/events).
