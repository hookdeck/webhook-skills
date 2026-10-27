# Terra API Webhooks Overview

## What Are Terra API Webhooks?

Terra (tryterra.co) is a wearables and health-data API. A **webhook destination** receives two kinds of deliveries for your connected users: authentication lifecycle events (a user connected, disconnected or hit an error) and normalised health data (activity, sleep, body, daily, ...). Every delivery is a `POST` with a JSON body and a `terra-signature` header.

## Common Event Types

The event type is the top-level `type` field of the body; every documented payload starts with it, and `status` (`success`, `warning`, `error`, ...) qualifies it. Terra documents 20 types.

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `auth` | A user connects a provider (check `status`) | Store the Terra `user_id`, mark the connection live |
| `deauth` | A user disconnects | Stop syncing, clean up |
| `user_reauth` | A user re-authenticates and gets a new user ID | Remap the stored user ID |
| `access_revoked` | The user revoked access at the provider | Ask the user to reconnect |
| `connection_error` | A provider connection fails | Alert, prompt reconnection |
| `activity` | New workout data | Training logs |
| `sleep` | New sleep data | Recovery dashboards |
| `body` | New body metrics | Health trends |
| `daily` | New daily summary | Daily dashboards |
| `athlete` | Profile data | Keep profile fields in sync |

The other documented types are `google_no_datasource`, `processing`, `large_request_sending`, `large_request_processing`, `rate_limit_hit` and further data types. The examples log anything they don't handle and return `200`.

In ping mode a data delivery carries `"type": "s3_payload"` and a download URL rather than the data itself.

## Event Payload Structure

```json
{
  "type": "activity",
  "status": "success",
  "user": { "user_id": "…", "provider": "FITBIT", "reference_id": "u_42" },
  "data": [ { "…": "…" } ]
}
```

Field names beyond `type` vary per event; check each event's Format block in the Terra docs.

## Delivery and Retries

- A `2xx` within **8 seconds** counts as success.
- Otherwise Terra retries up to **10 times** with exponential backoff starting at 30 seconds (about 8 hours in all), then drops the event without notice.
- A per-destination circuit breaker pauses **data** events (not auth events) during sustained failure. Paused cycles count toward the 10 retries.

Acknowledge quickly and process asynchronously. Running behind the Hookdeck Event Gateway gives you queuing, replay and alerting so nothing is dropped silently.

## Full Event Reference

For the complete list of events, see [Terra's webhook documentation](https://docs.tryterra.co/health-and-fitness-api/integration-setup/setting-up-data-destinations/webhooks).
