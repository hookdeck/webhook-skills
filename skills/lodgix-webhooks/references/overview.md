# Lodgix Webhooks Overview

## What Are Lodgix Webhooks?

Lodgix is vacation-rental property management software. Account webhooks let Lodgix
notify an outside system the moment something happens in your account. When an event
you subscribe to occurs, Lodgix sends an HTTP `POST` with a JSON payload to an
`https://` URL you choose. Typical targets are automation platforms such as n8n or
your own service.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.received` | A guest message is received | Forward to chat/CRM, auto-reply, create a support ticket |

`message.received` is the only event available today; Lodgix says more event types
may be added later. The event name arrives in the `X-Lodgix-Event` header.

## Request Headers

| Header | Meaning |
|--------|---------|
| `X-Lodgix-Event` | Event type, for example `message.received` |
| `X-Lodgix-Delivery` | A unique ID for this delivery |
| `X-Lodgix-Timestamp` | Unix time (seconds) when the request was signed |
| `X-Lodgix-Signature` | `sha256=<hex>` signature of the payload |

## Event Payload Structure

Lodgix does not document the JSON body shape. The examples in this skill use an
**illustrative** payload (not Lodgix's real schema) and only verify the signature
and dispatch on `X-Lodgix-Event`. Inspect a real delivery (for example in the
Hookdeck CLI web UI) before depending on specific fields.

## Deliveries and Retries

A non-2xx response is retried with backoff: 30 seconds, then 5 minutes, 30 minutes,
2 hours, and 6 hours. A delivery moves through `Pending` to `Success`, or `Failed`
and eventually `Exhausted` if every retry fails. Each delivery stores the last HTTP
status code and error. An endpoint that keeps failing can be disabled
automatically; fix it and use **Re-enable** on the endpoint card.

Respond `2xx` quickly and process asynchronously. Use `X-Lodgix-Delivery` to ignore
duplicates.

## Full Event Reference

See [Lodgix's webhook documentation](https://support.lodgix.com/en/articles/15424136-webhooks).
