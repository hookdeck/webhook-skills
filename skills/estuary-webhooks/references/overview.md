# Estuary Webhooks Overview

## What Are Estuary Webhooks?

Estuary (real-time data integration) makes outbound HTTP requests in two ways:

- **Materialization triggers**: a trigger fires **once per committed transaction**. The body is
  the author's `payloadTemplate`. Variables include `materialization_name`, `collection_names`,
  `flow_published_at_min`, `flow_published_at_max` and `run_id`.
- **HTTP Webhook materialization connector**: sends the materialized documents to your URL.
  Its custom headers live at `/headers/customHeaders`.

Neither is signed. Authentication is a secret header you add yourself (see
[verification.md](verification.md)).

## HTTP Methods

Triggers default to `POST` and accept `POST`, `PUT` or `PATCH`. The example handlers also accept
`GET` and `DELETE` so a differently configured sender is never rejected for its method.

## Which Events Does Estuary Send?

There is **no event-type field** and no fixed event names. What you receive depends on the
sender's configuration:

| Kind | How to recognise it | Notes |
|------|---------------------|-------|
| materialization trigger | body is your `payloadTemplate` (e.g. has `materialization_name`) | one request per committed transaction |
| HTTP Webhook connector document | any other JSON document | shape is defined by your collection and fields |

## Illustrative Payload

This is an **illustrative** trigger body built from the documented template variables, not a
fixed schema. Your `payloadTemplate` decides the real shape:

```json
{
  "materialization_name": "acmeCo/orders/to-warehouse",
  "collection_names": ["acmeCo/orders"],
  "flow_published_at_min": "2026-01-01T00:00:00Z",
  "flow_published_at_max": "2026-01-01T00:00:05Z",
  "run_id": "run-0001"
}
```

## Failure Handling

Non-retryable 4xx responses fail the trigger, so use `401` only for a bad credential and
return `2xx` once you have accepted the request. Make handlers idempotent (for example on
`run_id` plus `materialization_name`).

## Full Reference

https://docs.estuary.dev/concepts/materialization-triggers/
