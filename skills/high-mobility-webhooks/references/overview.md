# High Mobility Webhooks Overview

## What Are High Mobility Webhooks?

High Mobility (high-mobility.com) is a connected-car data platform. A webhook is configured per app (API Credentials > Webhooks) with a URL, a secret and a choice of events. High Mobility then calls your URL when something changes, such as a fleet vehicle's clearance.

Delivery behaviour (from the docs):

- Any `2xx` response counts as success.
- 10 second connect timeout and 10 second response timeout.
- Failed deliveries are retried every 10 minutes, up to 200 attempts in production and 5 in the sandbox.
- Duplicates and out-of-order events are possible, so make handlers idempotent.

## Common Event Types

The event name is in the nested `event.type` field of the body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `fleet_clearance_changed` | A fleet vehicle's clearance changes | Track onboarding status, surface rejections (`event.action` = `rejected`, `event.detail` = reason) |
| `ping` | The webhook configuration changes | Confirm the endpoint is reachable and verifying correctly |

`ping` is a normal signed delivery, not a challenge: verify it like any other and answer `2xx`. Its `vehicle.vin` is `*`.

## Event Payload Structure

```json
{
  "vehicle": { "vin": "1HMCF6112HA3FBBCC" },
  "event": {
    "type": "fleet_clearance_changed",
    "action": "rejected",
    "detail": "invalid VIN",
    "received_at": "2025-06-19T09:49:08.386159Z"
  },
  "application": { "id": "A77294AC8DA324FB46DA98921" }
}
```

Treat every field as untrusted after verification: check that the body and each nested object are the expected type before reading into them.

## HTTP Method

The docs don't name the HTTP method. Hookdeck's High Mobility source pre-selects POST without managing the method, so allow any other method the sender uses on the source too. The examples accept GET, POST, PUT, PATCH and DELETE.

## Full Event Reference

For the complete list of events, see [High Mobility's webhook documentation](https://docs.high-mobility.com/docs/webhooks).
