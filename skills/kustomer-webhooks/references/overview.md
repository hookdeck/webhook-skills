# Kustomer Webhooks Overview

## What Are Kustomer Webhooks?

Kustomer outbound webhooks POST a JSON Kustomer Event object to a URL you choose whenever a subscribed object is created or updated. Admins create them in **Settings > Platform > Outbound webhooks**, through `POST /v1/outbound-webhooks` (needs an API key with the `org.permission.outbound_webhook` permission), or in a Kustomer app definition (`outboundWebhooks`). Payloads are fixed; you cannot filter or customize fields.

## Common Event Types

The event type is the `name` field in the request body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `kustomer.conversation.create` | A conversation is created | Open a ticket in another system, notify a channel |
| `kustomer.conversation.update` | A conversation is updated | Sync status, assignment, tags |
| `kustomer.customer.create` | A customer is created | Sync to CRM or warehouse |
| `kustomer.customer.update` | A customer is updated | Keep profiles in sync |
| `kustomer.message.create` | A message is created | Archive transcripts, sentiment analysis |
| `kustomer.message.update` | A message is updated | Track edits and delivery state |
| `kustomer.team.create` / `kustomer.team.update` | A team is created / updated | Directory sync |
| `kustomer.user.create` / `kustomer.user.update` | A user is created / updated | Directory sync |

Org-level events such as `org.user.login`, `org.permission.update`, `app.install` and `app.uninstall` are not available for outbound webhooks.

## Event Payload Structure

```json
{
  "id": "608732dc222ea5008fb75818",
  "name": "kustomer.customer.create",
  "org": "5f8481c6a22ab5b9d5f2dd8a",
  "orgName": "org-name",
  "partition": "5f8481c6a22ab5b9d5f2dd8a",
  "data": { "type": "customer", "id": "...", "attributes": { }, "relationships": { } },
  "createdAt": "2021-04-26T21:38:36.418Z",
  "changes": null,
  "persist": true
}
```

- `id` is the event ID; use it for idempotency.
- `data` is a JSON:API-style snapshot of the object.
- `changes` is `null` on create and lists `before`/`after` per attribute on update.

## Delivery and Retries

Kustomer attempts each event 10 times over about 80 minutes. After 10 consecutive failures (timeouts, non-2xx, connection errors) the webhook is turned off and must be re-enabled manually in **Settings > Platform > Outbound Webhooks**. No notification is sent when this happens. Return 2xx quickly and process asynchronously.

## Full Event Reference

See [Kustomer outbound webhooks](https://help.kustomer.com/outbound-webhooks-rkUQvela8) and the [developer docs with sample payloads](https://developer.kustomer.com/kustomer-apps-platform/docs/outbound-webhooks).
