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

The body is documented in Bitculator's OpenAPI spec (`https://bitculator.com/api/v1/openapi.json`, the `alarmTriggered` callback of `POST /api/v1/webhooks`). Its example:

```json
{
  "event": "alarm.triggered",
  "created_at": "2026-07-03T08:00:00+00:00",
  "data": {
    "alarm": {
      "id": 42,
      "name": "BTC above 70k",
      "coin": { "slug": "bitcoin", "symbol": "BTC", "name": "Bitcoin" },
      "metric": "rate",
      "direction": "above",
      "target": "70000.00000000",
      "triggered_at": "2026-07-03T08:00:00+00:00"
    }
  }
}
```

`metric` is the watched column (`rate`, `volume` or `marketcap`), `direction` is `above` or `below`, and `target` is a decimal string identical to the alarm resource's `target`. A test delivery from `POST /api/v1/webhooks/{id}/test` sends `data: { test: true, alarm: null }`. The examples verify the raw bytes first, route on `X-Bitculator-Event`, then check each field's type before reading into it.

## Delivery Behaviour

- Method and format: POST with a JSON body.
- Success: reply with a 2xx. Any other status counts as a failed attempt.
- Retries: "Each delivery is attempted up to 3 times with backoff, a test event once; an endpoint auto-disables after 10 consecutive failed deliveries." The endpoint object's `consecutive_failures` and `disabled_at` fields show where an endpoint stands (`GET /api/v1/webhooks`). Because deliveries are retried, deduplicate in your handler.
- Not documented: the backoff intervals, the timeout, source IP addresses and any delivery ID.
- `GET /api/v1/webhooks/{id}/deliveries` returns a delivery log kept for 30 days (event, `response_status`, `error`, `attempts`, `delivered_at`), which helps debug failing receivers.

## Full Event Reference

See [Bitculator's API documentation](https://bitculator.com/en/documentation/crypto-api/v1) (the Webhooks section). The page shows a Cloudflare check to non-browser clients, so open it in a browser, or read the same content from the [OpenAPI spec](https://bitculator.com/api/v1/openapi.json).
