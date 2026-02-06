# Hookdeck Event Gateway Overview

## What Is the Event Gateway?

The Hookdeck Event Gateway is a webhook proxy and durable message queue that sits between webhook providers (Stripe, GitHub, Shopify, etc.) and your application. Providers send webhooks to Hookdeck, which guarantees ingestion, queues events, applies routing rules, and delivers them to your app.

```
┌──────────────┐     ┌─────────────────────────┐     ┌──────────────┐
│   Provider   │────▶│   Hookdeck Event        │────▶│   Your App   │
│ (Stripe etc) │     │   Gateway               │     │ (Express,    │
└──────────────┘     │                         │     │  Next.js,    │
                     │  • Guaranteed ingestion  │     │  FastAPI)    │
                     │  • Durable queue         │     └──────────────┘
                     │  • Retries & rate limit  │
                     │  • Filter & transform    │
                     │  • Full observability    │
                     └─────────────────────────┘
```

## How Hookdeck Modifies Requests

When Hookdeck forwards a webhook to your destination, it:

1. **Preserves the original request** — body, headers, query string, and path are all forwarded unchanged
2. **Adds Hookdeck headers** — metadata about the event, source, destination, and delivery attempt
3. **Signs the request** — adds an `x-hookdeck-signature` header (HMAC SHA-256, base64) so you can verify the request came from Hookdeck

## Event Flow

1. Provider sends a webhook to your Hookdeck source URL (`https://events.hookdeck.com/e/src_xxx`)
2. Hookdeck receives the request and immediately returns a `200` to the provider (guaranteed ingestion)
3. If source verification is configured, Hookdeck verifies the provider's signature
4. Hookdeck creates an event and applies connection rules (filters, transforms, deduplication)
5. The event is queued for delivery to your destination, respecting rate limits
6. Hookdeck forwards the request to your destination URL with Hookdeck headers and signature
7. Your app verifies the `x-hookdeck-signature`, processes the event, and returns a status code
8. If delivery fails (non-2xx or timeout), Hookdeck retries automatically based on your retry rules

## Hookdeck Headers

When Hookdeck forwards a request, it adds these headers:

| Header | Description |
|--------|-------------|
| `x-hookdeck-signature` | HMAC SHA-256 signature of the request body, base64 encoded. Present when Hookdeck Signature Auth is set on the destination. |
| `x-hookdeck-eventid` | Unique event ID. Use for idempotency — check this before processing to avoid duplicates. |
| `x-hookdeck-requestid` | ID of the original request received by Hookdeck. |
| `x-hookdeck-source-name` | Name of the source that received the webhook. |
| `x-hookdeck-destination-name` | Name of the destination receiving the event. |
| `x-hookdeck-attempt-count` | Number of delivery attempts for this event. |
| `x-hookdeck-attempt-trigger` | What triggered this delivery: `INITIAL` (first attempt), `AUTOMATIC` (auto-retry), `MANUAL` (manual retry), `BULK_RETRY`, or `UNPAUSE`. |
| `x-hookdeck-will-retry-after` | Seconds until the next automatic retry. Absent on the last retry. |
| `x-hookdeck-event-url` | Direct URL to view this event in the Hookdeck dashboard. |
| `x-hookdeck-verified` | Boolean — whether Hookdeck verified the original provider's signature at the source level. |
| `x-hookdeck-original-ip` | IP address of the client that sent the original request. |

The `x-hookdeck` prefix can be customized in your project settings.

## Original Headers Are Preserved

Hookdeck preserves all original headers from the provider. For example, if Stripe sends a `stripe-signature` header, your app will see both `stripe-signature` and `x-hookdeck-signature` on the forwarded request.

This means you can either:
- **Verify the Hookdeck signature** (recommended when using source verification) — simpler, one verification scheme for all providers
- **Verify the original provider signature** — if you need to verify independently of Hookdeck (note: timestamp-based signatures may fail on retries if the retry happens outside the provider's tolerance window)

## Full Documentation

- [Hookdeck Documentation](https://hookdeck.com/docs)
- [Hookdeck Destinations — Headers](https://hookdeck.com/docs/destinations#headers)
- [Hookdeck Authentication](https://hookdeck.com/docs/authentication)
