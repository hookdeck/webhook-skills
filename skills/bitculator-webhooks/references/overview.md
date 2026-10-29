# Bitculator Webhooks Overview

## What Are Bitculator Webhooks?

Bitculator (bitculator.com) is a crypto market data API (prices, OHLCV, sentiment, indicators) with price alarms. A webhook endpoint registered through the Data API v1 receives signed HTTP deliveries when an event fires. Each delivery carries an `X-Bitculator-Signature` header (`t=<unix seconds>,v1=<hex HMAC-SHA256>`) that you verify with the signing secret returned when you registered the endpoint.

Up to 5 endpoints can be registered per account, and endpoints must be public HTTPS hosts.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `alarm.triggered` | A price alarm fires | Trading notifications, dashboards, chat alerts |

`alarm.triggered` is the only value Bitculator accepts in an endpoint's `events` list ("Events to subscribe to. Allowed values: alarm.triggered.").

## Event Payload Structure

**The delivery body is not documented.** Bitculator's docs show no payload example and no event field or header. The one documented body fact is that a delivery from the test endpoint has `test: true` in the payload.

The examples therefore:

1. verify the signature over the raw bytes first;
2. parse the body only if it is JSON (a non-JSON body is acknowledged and logged, not a 500);
3. use a top-level string `event` (or `type`) as the event name when present, otherwise assume `alarm.triggered`;
4. treat `test: true` as a test delivery;
5. check the type of every parsed field before using it.

The bodies in the example tests are illustrative, not Bitculator's documented format:

```json
{
  "event": "alarm.triggered",
  "test": true,
  "data": {
    "alarm": {
      "id": 42,
      "name": "BTC above 100k",
      "coin": { "slug": "bitcoin", "symbol": "BTC", "name": "Bitcoin" },
      "metric": "rate",
      "direction": "above",
      "target": "100000",
      "notification": "webhook",
      "status": "triggered",
      "created_at": "2026-01-15T10:00:00Z"
    }
  }
}
```

The `alarm` object mirrors an item of `GET /api/v1/alarms` (`id`, `name`, `coin`, `metric`, `direction`, `target` as a string, `notification`, `status`, `created_at`). Capture a real delivery from `POST /api/v1/webhooks/{id}/test` (for example in the Hookdeck CLI web UI) before relying on any field.

## Delivery Behavior

- The HTTP method and `Content-Type` are not documented. Hookdeck's Bitculator source manages the method as POST.
- Retry schedule, timeout and auto-disable thresholds are not documented. The endpoint object has `consecutive_failures` and `disabled_at` fields, which suggests repeated failures can disable an endpoint; check them with `GET /api/v1/webhooks`.
- `GET /api/v1/webhooks/{id}/deliveries` returns a delivery log kept for 30 days (event, `response_status`, `error`, `attempts`, `delivered_at`), which helps debug failing receivers.

## Full Event Reference

See [Bitculator's API documentation](https://bitculator.com/en/documentation/api/v1). The page answers non-browser clients with a Cloudflare challenge, so open it in a browser.
