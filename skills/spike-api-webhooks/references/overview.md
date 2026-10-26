# Spike API Webhooks Overview

## What Are Spike API Webhooks?

Spike API is a unified health and wearables data API. Each application configures
**one** webhook endpoint in the admin console. After each data update from a
provider (Garmin, Oura and others), Spike API sends a webhook event to that
endpoint so you can fetch the new data.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `record_change` | New or updated data is received from the provider | Fetch records for the affected time range |
| `provider_integration_created` | A user has integrated with a provider | Mark the integration active |
| `provider_integration_deleted` | A user's integration has been deleted | Stop syncing, clean up |

## Event Payload Structure

The body is a **JSON array of events**; one delivery can contain several. Fields:

| Field | Description |
|-------|-------------|
| `application_user_id` | The application user ID you provided when getting the access token |
| `timestamp` | Time of the event |
| `event_type` | One of the three types above |
| `metrics` | Metric types involved (`record_change`) |
| `activity_types` | Activity types involved, if any (`record_change`) |
| `provider_slug` | Provider triggering the event, e.g. `garmin`, `oura` |
| `earliest_record_start_at` | Earliest timestamp of the records involved (ISO 8601) |
| `latest_record_end_at` | Latest timestamp of the records involved (ISO 8601) |

```json
[
  {
    "application_user_id": "User1",
    "timestamp": "2025-04-15T13:33:55.271331177Z",
    "event_type": "record_change",
    "metrics": ["calories_burned_active", "distance", "steps"],
    "activity_types": ["sedentary", "walking"],
    "provider_slug": "garmin",
    "earliest_record_start_at": "2025-04-15T09:30:00Z",
    "latest_record_end_at": "2025-04-15T13:33:00Z"
  }
]
```

`provider_integration_created` and `provider_integration_deleted` events carry only
`application_user_id`, `timestamp`, `event_type` and `provider_slug`.

## Delivery

Your endpoint must answer exactly HTTP 200. A network error, a response slower than
30 seconds or any other status is retried up to 10 times with backoff (5 s, 2 min,
30 min, 2 h, then every 12 h); then the event is discarded.

## Full Event Reference

See [Spike API's webhook documentation](https://docs.spikeapi.com/api-docs/webhooks).
