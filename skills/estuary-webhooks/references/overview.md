# Estuary Webhooks Overview

## What Are Estuary Webhooks?

Estuary (real-time data integration) makes outbound HTTP requests in two ways:

- **Materialization triggers**: a trigger fires **once per committed transaction**. The body is
  the author's `payloadTemplate`. Variables include `materialization_name`, `collection_names`,
  `flow_published_at_min`, `flow_published_at_max` and `run_id`.
- **HTTP Webhook materialization connector**: sends the materialized documents to your URL
  as a `POST` whose body is a JSON array of documents from one binding. Its custom headers
  live at `/headers/customHeaders`, and each binding sets a `relativePath`.

Neither is signed. Authentication is a secret header you add yourself (see
[verification.md](verification.md)).

## HTTP Methods

Triggers default to `POST` and accept `POST`, `PUT` or `PATCH`. The HTTP Webhook connector
uses `POST`. The example handlers also accept
`GET` and `DELETE` so a differently configured sender is never rejected for its method.

## Which Events Does Estuary Send?

There is **no event-type field** and no fixed event names. What you receive depends on the
sender's configuration:

| Kind | How to recognise it | Notes |
|------|---------------------|-------|
| materialization trigger | body is whatever your `payloadTemplate` renders | one request per committed transaction, or at most one per `interval` |
| HTTP Webhook connector batch | a JSON array of documents | each element holds the binding's selected fields |

## Example Payloads

Estuary's example `payloadTemplate` renders this trigger body with the example values its
docs print. Your template decides the real shape:

```json
{
  "materialization": "acmeCo/example/database-views",
  "collections": ["acmeCo/example/collection"],
  "publishedAtMin": "2024-01-15T08:30:00Z",
  "publishedAtMax": "2024-01-15T08:31:00Z",
  "runId": "2024-01-15T08:30:00.000Z"
}
```

Estuary's example HTTP Webhook connector body:

```json
[{"id": 1, "status": "shipped", "flow_published_at": "2026-10-23T14:00:00Z"}]
```

## Failure Handling

Non-retryable 4xx responses fail the trigger, and a failed trigger fails the transaction and
restarts the materialization, so use `401` only for a bad credential and return `2xx` once you
have accepted the request. Delivery is at least once. Estuary suggests `run_id` as the
idempotency key; it's a timestamp, so pair it with `materialization_name` if several
materializations share an endpoint.

## Full Reference

https://docs.estuary.dev/concepts/materialization-triggers/
