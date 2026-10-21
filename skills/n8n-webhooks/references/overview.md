# n8n Webhooks Overview

## What Are n8n Webhooks?

[n8n](https://n8n.io) is a workflow automation platform. Its **HTTP Request** node can call
any URL, which makes it the usual way to push data from an n8n workflow into your own
application: "when a form is submitted / a row changes / a schedule fires, POST it to my
API".

This skill covers the receiving side of that request. (n8n's own **Webhook** trigger node is
the opposite direction: other services calling into n8n.)

Things that differ from provider webhooks such as Stripe or GitHub:

- **No signature.** n8n doesn't sign outgoing requests. You authenticate them with a shared
  secret sent through an n8n credential (Header auth, Bearer auth or Basic auth). See
  [verification.md](verification.md).
- **No built-in event types.** The method, headers and body are whatever you configure on the
  node. Add an `event` field to the body so one endpoint can route several workflows.
- **One request per item.** The HTTP Request node runs once for each input item, so a workflow
  step that outputs 50 items sends 50 requests. Use the node's **Batching** option (Items per
  Batch, Batch Interval) to pace them.
- **Retries are opt-in.** n8n only retries a failed request if you turn on **Retry On Fail** in
  the node's settings. By default a non-2xx response makes the node error and the workflow
  stops (unless **Never Error** or the node's error handling says otherwise).

## Suggested Payload Shape

Set the node's **Send Body** on, **Body Content Type** to **JSON**, and **Specify Body** to
**Using JSON**:

```json
{
  "event": "order.created",
  "id": "{{ $execution.id }}-{{ $itemIndex }}",
  "data": {
    "order_id": "{{ $json.orderId }}",
    "email": "{{ $json.email }}"
  }
}
```

| Field | Purpose |
|-------|---------|
| `event` | Routes the request to a handler. You choose the names. |
| `id` | Unique per request; use it as an idempotency key if you turn on Retry On Fail. |
| `data` | The item data from earlier nodes. |

## Example Event Types

These are the names the example handlers in this skill use. They are a convention, not n8n
event types; rename them to fit your workflows.

| Event | Sent When | Common Use Cases |
|-------|-----------|------------------|
| `lead.created` | A workflow captures a new lead (form, CRM, ads) | Add to CRM, notify sales |
| `order.created` | A workflow sees a new order | Fulfilment, invoicing |
| `workflow.completed` | A long-running workflow finishes | Mark a job done, notify the user |
| `workflow.failed` | An Error Trigger workflow catches a failure | Alerting, incident tracking |

## Full Reference

- [HTTP Request node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [HTTP Request credentials](https://docs.n8n.io/integrations/builtin/credentials/httprequest/)
