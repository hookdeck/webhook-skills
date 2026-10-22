# Workato Webhooks Overview

## What Are Workato Webhooks?

[Workato](https://www.workato.com) is an enterprise automation platform. It has no native
outbound webhooks: a recipe pushes data to your own application with an **HTTP connector
action** ("send a request to my API when a record changes / an order arrives / a schedule
fires"). This skill covers the receiving side of that request. (Workato's own webhook
*triggers*, where other services call into Workato, are the opposite direction.)

Things that differ from provider webhooks such as Stripe or GitHub:

- **No signature.** Workato doesn't sign outgoing requests, and there is no timestamp. The
  HTTP connection authenticates with Basic auth (a static username and password). See
  [verification.md](verification.md).
- **No built-in event types.** The method, headers and body are whatever the recipe's HTTP
  action sends. Add an `event` field to the body so one endpoint can route several recipes.
- **The method is your choice.** The HTTP action can be `GET`, `POST`, `PUT`, `PATCH` or
  `DELETE`, and a `GET` has no body. The endpoint should accept all of them.
- **Failures are visible in the job.** A non-2xx response fails the HTTP action, and the
  recipe's error handling (or a retry setting on the step) decides what happens next. Make
  your handler idempotent.

## Suggested Payload Shape

In the HTTP action, set the request body to JSON (`application/json`):

```json
{
  "event": "order.created",
  "data": {
    "order_id": "ord_123",
    "email": "jane@example.com"
  }
}
```

| Field | Purpose |
|-------|---------|
| `event` | Routes the request to a handler. You choose the names. |
| `data` | The record data mapped from earlier recipe steps. |

Add a unique `id` (for example a job or record id) if you need to dedupe retries.

## Example Event Types

These are the names the example handlers use. They are a convention, not Workato event types;
rename them to fit your recipes.

| Event | Sent When | Common Use Cases |
|-------|-----------|------------------|
| `order.created` | A recipe sees a new order | Fulfilment, invoicing |
| `record.updated` | A recipe syncs a changed record | Keep a local copy in step |
| `recipe.failed` | An error-handling step reports a failure | Alerting, incident tracking |

## Full Reference

- [Workato HTTP connection setup](https://docs.workato.com/en/developing-connectors/http/connection-setup.html)
