# PostHog Webhooks Overview

## What Are PostHog Webhooks?

PostHog sends webhooks through the **Webhook destination** in the CDP (Data pipelines → Destinations → HTTP Webhook). A destination runs for each matching event (or person/other source) and sends an HTTP request to your URL with a templated body. Docs: https://posthog.com/docs/cdp/destinations/webhook

Requests are signed only if you set the optional **Signing secret**; see [verification.md](verification.md).

## Common Event Types

The webhook body carries a PostHog analytics event. The event name is in `event.event`:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `$pageview` | A page is viewed | Page analytics, notify on key pages |
| `$identify` | A user is identified | Sync users to CRM |
| `$autocapture` | Click/input autocaptured | UI interaction tracking |
| `$pageleave` | A user leaves a page | Session analysis |
| custom (e.g. `signed_up`) | Your app captures it | Conversion alerts, billing triggers |

Which events are sent is decided by the destination's filters, not by a fixed list.

## Event Payload Structure

Default body template: `{ "event": "{event}", "person": "{person}" }`, which renders as:

```json
{
  "event": {
    "event": "$pageview",
    "uuid": "0190-abc",
    "distinct_id": "user_1",
    "properties": { "$current_url": "https://example.com" },
    "timestamp": "2026-10-22T10:00:00Z"
  },
  "person": { "id": "p1", "properties": {} }
}
```

The JSON body, method, and headers are editable in the destination, so a custom template changes the shape. Always dispatch on what your template sends.

## Full Event Reference

See PostHog's [event docs](https://posthog.com/docs/data/events) and the [webhook destination docs](https://posthog.com/docs/cdp/destinations/webhook).
