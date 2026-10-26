# RootFi (Commenda) Webhooks Overview

## What Are RootFi Webhooks?

RootFi is a unified accounting, commerce and payments integrations API, now documented as Commenda integrations (integrations.docs.commenda.io). When data is synced from a connected platform, a connection changes state, or an end user requests a disconnect, RootFi POSTs a JSON event to a URL you control. The body is exactly the event payload, with no extra wrapper.

Each webhook config subscribes to **exactly one** event type, so create one config per event you want.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `DATA_MODEL_CHANGES` | Synced records are created, updated, or deleted | Mirror RootFi data (invoices, contacts) into your own store |
| `SYNC_STARTED` | A sync begins | Show sync progress, track `sync_id` |
| `SYNC_COMPLETED` | A sync finishes | Check which data models succeeded or failed |
| `CONNECTION_CHANGED` | A company's connection is established, expires, or is disconnected | Prompt customers to reconnect |
| `DISCONNECT_REQUESTED` | An end user requests a disconnect from the SDK | Route the request to a human; it does not disconnect anything |

## Event Payload Structure

Every body has two keys. The type is in `event`; everything else is under `data`. No header names the event type.

```json
{ "event": "SYNC_COMPLETED", "data": { "sync_id": "pt21IJtaATVZJ5v", "status": "SUCCESS", "company_id": 1234, "integration_type": "XERO" } }
```

### DATA_MODEL_CHANGES

`data` carries `company_id`, `integration_type`, `data_model` (for example `INVOICE`), `type` (`CREATE`, `UPDATE`, or `DELETE`), `job_id`, `sync_id`, `no_of_records`, and `records`.

- Records are batched: at most 50 per delivery, deduplicated by `platform_id` within a batch. `records` is a page, not the complete set for that `sync_id`.
- The same record can arrive more than once (a `CREATE` then an `UPDATE` with no meaningful change). Upsert on `platform_id` and compare the fields you use.
- `UPDATE` is sent only when a record actually changed. `DELETE` is detected only during a full sync.
- A config's lowercase `topics` (`invoice.create`, `contact.delete`) filter these deliveries, but the topic is not sent as a field. An empty topic list on the API matches every data model and operation.

### SYNC_STARTED

`data`: `sync_id`, `company_id`, `integration_type`, `data_models` (array), `full_sync` (boolean).

### SYNC_COMPLETED

`data`: `sync_id` (`id` carries the same value; prefer `sync_id`), `type` (`PULL`), `status`, `start_time`, `end_time`, `total_jobs_count`, `success_jobs_count`, `failed_jobs_count`, `running_jobs_count`, `created_jobs_count`, `data_models`, `company_id`, `integration_type`. `status` is `SUCCESS` when every job succeeded, otherwise `FAILED`, `RUNNING`, or `CREATED`. A partial failure is `FAILED` with a non-zero `failed_jobs_count`: inspect the counts.

### CONNECTION_CHANGED

`data`: `connection_id` (composite `{company_id}_{integration_type}`, for example `1234_XERO`), `company_id`, `integration_type`, `status` (`HEALTHY`, `EXPIRED`, or `DISCONNECTED`).

### DISCONNECT_REQUESTED

`data`: `disconnect_request_id`, `connection_id`, `company_id`, `integration_type`. The connection stays active and keeps syncing until an authenticated dashboard user resolves the request.

## Delivery and Retries

- Method and body: `POST` with a JSON body (`Content-Type: application/json`).
- Success: any `2xx`. Anything else, including a timeout, is retried up to 5 attempts in total, with backoff `min(60 × 2^attempt, 900)` seconds (about 1, 2, 4, 8 minutes, then capped at 15). Requests time out after 30 seconds.
- After the final failed attempt the delivery is marked failed and is not retried. Deliveries are also dropped if the config is disabled or deleted before they are sent.
- Return a `2xx` as soon as you have durably accepted the payload and process asynchronously; slow handlers burn into the 30-second timeout.
- At-least-once, no ordering: a `SYNC_COMPLETED` can arrive before the last `DATA_MODEL_CHANGES` batch of that sync. Deduplicate on `X-RootFi-Webhook-Delivery-Id` (stable across retries), reconcile against `sync_id`, and upsert rather than insert.
- Delivery history and response codes: `GET /v4/core/webhook-logs` and the dashboard.

## Full Event Reference

For the complete reference, see [RootFi's webhook documentation](https://integrations.docs.commenda.io/documentation/concepts/webhooks).
