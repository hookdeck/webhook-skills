# Bitculator Webhooks Overview

## What Are Bitculator Webhooks?

Bitculator (bitculator.com) is a crypto market data API (prices, OHLCV, sentiment, indicators) with price alarms. A webhook endpoint registered through the Data API v1 receives a signed JSON `POST` when an event fires. Each delivery carries an `X-Bitculator-Signature` header (`t=<unix seconds>,v1=<hex HMAC-SHA256>`), which you verify with the signing secret returned when you registered the endpoint, and an `X-Bitculator-Event` header naming the event (not signed).

Up to 5 endpoints can be registered per account, and endpoints must be public HTTPS hosts.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `alarm.triggered` | A price alarm fires | Trading notifications, dashboards, chat alerts |

`alarm.triggered` is the only value Bitculator accepts in an endpoint's `events` list ("Events to subscribe to. Allowed values: alarm.triggered.").

## Event Payload Structure

Bitculator's docs: "Bitculator POSTs each event as JSON with an HMAC signature header", followed by the two delivery headers:

```
X-Bitculator-Signature: t=<unix-ts>,v1=<hex hmac_sha256("<ts>.<raw-body>", secret)>
X-Bitculator-Event: alarm.triggered
```

`X-Bitculator-Event` names the event but is **not** covered by the signature, so treat it as a routing label you read only after the signature checks out. The examples assume `alarm.triggered` when it is absent and acknowledge (`200`) and skip events they don't know.

**The body's fields are not documented.** The body is JSON, but the docs show no payload example; the one documented body fact is that a test delivery has `test: true`. The examples therefore:

1. verify the signature over the raw bytes first;
2. route on `X-Bitculator-Event`, skipping unknown events;
3. parse the body defensively (a non-JSON body is acknowledged and logged, not a 500);
4. treat `test: true` as a test delivery;
5. check the type of every parsed field before using it.

The bodies in the example tests are illustrative, not Bitculator's documented format:

```json
{
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

- Method and format: POST with a JSON body. Hookdeck's Bitculator source manages the method as POST.
- Retries: "Each delivery is attempted up to 3 times with backoff, a test event once; an endpoint auto-disables after 10 consecutive failed deliveries." The endpoint object's `consecutive_failures` and `disabled_at` fields show where an endpoint stands (`GET /api/v1/webhooks`). Because deliveries are retried, deduplicate in your handler.
- Not documented: the backoff intervals, the timeout, source IP addresses and any delivery ID.
- `GET /api/v1/webhooks/{id}/deliveries` returns a delivery log kept for 30 days (event, `response_status`, `error`, `attempts`, `delivered_at`), which helps debug failing receivers.

## Full Event Reference

See [Bitculator's API documentation](https://bitculator.com/en/documentation/api/v1) (the Webhooks section). The page shows a Cloudflare check to non-browser clients, so open it in a browser.
