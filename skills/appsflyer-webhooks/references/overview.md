# AppsFlyer Webhooks Overview

## What Is the AppsFlyer Push API?

The Push API (streaming raw data) sends a raw-data record to your server for
each attributed install and in-app event, as it happens. You choose the method:
**POST** sends the record in the body as JSON; GET puts the data in the query
string, which leaks into access logs, so use POST.

AppsFlyer does not sign the payload. Authentication is a custom authorization
header (name and token) that you configure per app ID.

## Common Event Types

The event name is the `event_name` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `install` | An install is attributed | Acquisition dashboards, CRM sync |
| `af_purchase` | A purchase in-app event | Revenue/ROAS pipelines |
| `af_complete_registration` | A registration in-app event | Funnel analytics |
| custom names | Any in-app event your app reports | App-specific analytics |

In-app event names are defined by your app (the `af_*` names are AppsFlyer's
standard ones), so the set of names you receive depends on what you instrument.

## Event Payload Structure

```json
{
  "event_name": "af_purchase",
  "appsflyer_id": "1700000000000-1234567",
  "app_id": "id123456789",
  "event_time": "2026-10-21 09:30:00",
  "event_value": "{\"af_revenue\":\"9.99\",\"af_currency\":\"USD\"}",
  "media_source": "organic"
}
```

| Field | Notes |
|---|---|
| `event_name` | `install` or an in-app event name |
| `appsflyer_id` | AppsFlyer's device/install identifier |
| `app_id` | The app the record belongs to |
| `event_time` | When the event happened |

Other fields (attribution, device, revenue) depend on the fields you select in
the Push API settings. `event_value` is typically a JSON-encoded string.

## Full Event Reference

See [AppsFlyer Push API (streaming raw data)](https://support.appsflyer.com/hc/en-us/articles/207034356-Push-API-streaming-raw-data).
