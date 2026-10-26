# Bump.sh Webhooks Overview

## What Are Bump.sh Webhooks?

Bump.sh is an API documentation and change-management platform. A webhook registered in a documentation's **Integrations** tab receives an HTTP request automatically when Bump.sh notices a **structural change** in that documentation, for example after a deployment changes the API definition. Notifications can go to several URLs, so you can plug them into chat, ticketing or CI tooling.

Each webhook is an HTTP `POST` with a JSON body, signed with the webhook's secret token in the `X-Bump-Signature-256` header (see [verification.md](verification.md)).

## Common Event Types

Bump.sh has a single notification. There is no event-name field or header in the request, so there is nothing to switch on.

| Notification | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| API documentation structure change | A deployment changes the structure of a documentation | Post the change to chat, open a ticket, trigger SDK or client regeneration, notify API consumers |

## Event Payload Structure

The body is JSON with two top-level fields:

```json
{
  "api": { "...": "the documentation the change belongs to" },
  "diff": { "...": "the structural change that was detected" }
}
```

The exact fields inside `api` and `diff` are described in Bump.sh's API documentation, which the webhook help page points to. Don't assume more than that: after the signature check passes, treat the body and each nested field as untrusted, check types (`typeof`, `Array.isArray`, `isinstance`) before reading into them, and ignore anything that isn't what you expect. The examples in this skill do exactly that and never answer a wrong-typed field with a `500`.

## Delivery

The Bump.sh docs say nothing about retries, timeouts or the response they expect, so this skill makes no claims about them. Reply with a `2xx` quickly and do heavy work asynchronously. The webhook's **Recent deliveries** list in the dashboard shows the last 10 notifications, and a **Test Webhook** element sends a test notification.

## Full Event Reference

See [Bump.sh's webhook documentation](https://docs.bump.sh/help/api-change-management/webhooks/).
