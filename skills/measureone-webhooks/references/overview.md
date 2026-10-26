# MeasureOne Webhooks Overview

## What Are MeasureOne Webhooks?

MeasureOne collects consumer-permissioned data (academic, income and employment, insurance,
tax forms). It is asynchronous: when something happens it POSTs a JSON notification to the URL
you configured. Webhooks are configured per Data Request through the `delivery_details` array,
where each entry has an `event_type` (optional; the account default is used if omitted), a `url`,
and optional `headers`.

Webhooks are **not signed**. You authenticate them with a static header you add under
`delivery_details[].headers` (see [setup.md](setup.md) and [verification.md](verification.md)).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `datarequest.report_complete` | The complete report for a Data Request is available | Fetch the report from `report_uri` |
| `datarequest.report_update_available` | Report data was updated or added; `report_complete` follows when complete | Refresh partial results |
| `datarequest.report_error` | Report generation failed (`reason_codes`: `UNSUPPORTED_FORMAT`, `UNPROCESSABLE_DOCUMENT_QUALITY`, `PARTIAL_DOCUMENT`, `NO_ITEMS`) | Ask the individual for better documents |
| `datarequest.items_available` | Extraction finished and Items are available | Pull `items` |
| `datarequest.items_processed` | All Items for the Data Request are processed | Pull processed data |
| `datarequest.no_items` | Extraction finished and no Item is available | Tell the individual nothing was found |
| `datarequest.refresh_failed` | A scheduled refresh failed (`INVALID_CREDENTIALS`, `MFA_REQUIRED`) | Ask the individual to reconnect |
| `datasource.connected` | A Datasource connection succeeded | Track onboarding progress |
| `transaction.processed` | A services API transaction completed | Fetch the service result |
| `unprocessable.entity` | A received item can't be processed | Request a new document |
| `session.rejected` | The Link session could not be processed | Follow up with the individual |
| `session.terminated` | The session was terminated (internal reasons or `max_latency` exceeded) | Retry or follow up |
| `session.no_login` | The Link widget closed without a successful connection | Re-send the invitation |
| `item.created` | An Item was created (extracted, uploaded in Link, or via `/items/new`) | Track items |
| `item.processed` | An Item was processed and its data can be pulled | Pull item data |
| `item.unavailable` | An Item type couldn't be extracted from the Datasource | Fall back to manual upload |
| `individual.purged` | An Individual was purged | Delete data on your side |

Deprecated but still documented: `datarequest.report_available`, `datarequest.updates_available`,
`datarequest.acquisition_completed`, `session.completed`.

## Event Payload Structure

The body is flat JSON. Common fields (not every event has every field):

- `event` - the event name from the table above
- `datarequest_id`, `individual_id`, `external_id`, `metadata`
- `is_refresh`, `refresh_id`, `monitor_events`
- event-specific fields, for example `report_uri`, `transaction_id`, `items`, `item_id`,
  `item_type`, `session_id`, `reason_code` / `reason_codes`

```json
{
  "event": "datarequest.items_available",
  "datarequest_id": "dr_01",
  "individual_id": "ind_01",
  "external_id": "ext_01",
  "metadata": {},
  "is_refresh": false
}
```

## Delivery and Retries

- POST, `content-type: application/json`.
- Any `2xx` acknowledges the delivery; the response body and headers are ignored.
- A non-2xx response, timeout or connection error is retried up to 10 times with exponential
  backoff (1, 2, 4, 8, 16, 32, 64, 128, 256, 512 minutes, plus jitter), then marked failed.

## Full Event Reference

See [MeasureOne's webhook documentation](https://docs.measureone.com/api/openapi_3.2/components/section/webhook/events)
and the [webhook event list](https://docs.measureone.com/api/openapi_3.2/openapi/webhooks).
