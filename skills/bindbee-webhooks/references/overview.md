# Bindbee Webhooks Overview

## What Are Bindbee Webhooks?

Bindbee (bindbee.dev) is a unified HRIS/ATS/LMS API. Webhooks tell your server when a connector is linked or needs attention, when a sync starts, completes or fails, and when records change. Each webhook is pinned to a version: version 2 (`2026.10.06`, current) or version 1 (`2025.01.01`, deprecated December 31, 2026). This skill covers version 2 only.

Deliveries are `POST` requests with a JSON body.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `connector.linked` | A connector is linked | Mark the customer's integration as connected |
| `connector.relinked` | A connector is relinked | Clear a "needs attention" state |
| `connector.relink_needed` | A connector's credentials need relinking (`error` present) | Prompt the customer to reconnect |
| `connector.sync.started` | A sync starts | Show sync progress |
| `connector.sync.completed` | A sync completes | Pull fresh data |
| `connector.sync.failed` | A sync fails (`error` present) | Alert and retry |
| `hris.employee.created` | An employee record is created | Provision accounts |
| `hris.employee.updated` | An employee record is updated | Update local profile |

Other documented events (92 in total; the list may not be exhaustive) follow the pattern `hris.<model>.created` / `hris.<model>.updated` for these models: `company`, `location`, `group`, `pay_group`, `payroll_code`, `payroll_run_calendar`, `employee`, `employment`, `compensation`, `dependent`, `bank_info`, `employer_benefit`, plus 62 more in Bindbee's list. Subscribe by exact event name (no wildcards).

## Event Payload Structure

```json
{
  "id": "…",
  "event": "hris.employee.created",
  "version": "2026.10.06",
  "sequence": 7,
  "model": "…",
  "occurred_at": "…",
  "webhook": { "…": "…" },
  "connector": { "…": "…" },
  "data": { "…": "…" },
  "sync": { "…": "…" },
  "error": { "…": "…" }
}
```

- `id` equals the `webhook-id` header: the dedupe key.
- `event` is the event name; `webhook.event` repeats it.
- `sequence` orders events per connector.
- `model` is present only on data events.
- `error` is present only on `connector.sync.failed` and `connector.relink_needed`.
- `sync` is absent on `connector.linked` and `connector.relinked`.

## Delivery and Retries

- Up to 4 attempts, 1/2/4 seconds apart (a `Retry-After` header may stretch a wait to 5 seconds), 10 second timeout each.
- 408, 429, 5xx, timeouts and network errors are retried. Other 4xx and 3xx responses are final (redirects are not followed).
- There is no redelivery or replay after the last attempt, and a failing endpoint stays enabled.
- One sync's events are sent one at a time in order. Across syncs and connectors order is not guaranteed: sort by `sequence`.

## Full Event Reference

See [Bindbee's webhook documentation](https://docs.bindbee.dev/webhooks/overview).
