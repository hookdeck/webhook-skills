# Stedi Webhooks Overview

## What Are Stedi Webhooks?

Stedi sends **events** to an **event destination**: an HTTPS URL you register in the Stedi portal or with the Events API (`https://events.us.stedi.com/2026-02-01/destinations`). Events report changes to Stedi resources, such as payer enrollments, processed files and translated transactions. You can create up to 16 destinations per account. Deliveries follow the [Standard Webhooks](https://www.standardwebhooks.com) specification. Stedi's Legacy webhooks are a different mechanism and aren't covered here.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `event.ping` | You click **Ping** on a destination | Confirm the endpoint is reachable and verifies |
| `enrollment.activated` | A transaction enrollment request is set to `LIVE` | Tell the provider they can start exchanging transactions with the payer |
| `enrollment.rejected` | The payer rejects the enrollment | Alert support, collect missing details |
| `enrollment.updated` | Status, payer, contacts, provider details, tasks or documents change | Keep local enrollment records in sync |
| `enrollment.task.assigned` | Stedi assigns an enrollment task to the provider (status becomes `PROVIDER_ACTION_REQUIRED`) | Prompt the provider to act |
| `enrollment.task.completed` | The provider completes a task | Track enrollment progress |
| `enrollment.task.deleted` | Stedi removes a task, usually superseded by a new one | Drop the obsolete to-do |
| `file.processed` | Stedi processes a file (for example a payer's 277CA) | Fetch the file via Retrieve File Execution Input |
| `file.failed` | Stedi can't process a file (parse error, SFTP connection problem) | Alert on ingestion failures |
| `transaction.processed` | Stedi receives and translates a transaction (835 ERA, 277CA, or your JSON claim to X12) | Pull the ERA/277CA report or the X12 file |
| `app.installed` / `app.uninstalled` | A customer installs or removes your OAuth app | Provision or clean up the customer account |

A file with several transactions produces one `file.processed` and one `transaction.processed` per transaction.

## Event Payload Structure

Events are thin. They name the resource but don't include its data.

```json
{
  "id": "evt_a81659f1-16a5-9bec-03e1-0ba8ab5e9652",
  "object": "v1.event",
  "type": "transaction.processed",
  "account": "11111111-2222-3333-4444-555555555555",
  "environment": "PRODUCTION",
  "created": "2026-03-30T23:19:00.501Z",
  "resource": { "id": "019bb508-dc63-73a1-8ddc-9d4720299072", "type": "transaction" },
  "relatedResources": [
    { "id": "019bb508-dc63-73a1-8ddc-9d4720299072", "type": "transaction.x12.835" },
    { "id": "01997873-bebb-7b33-81ef-f408866dfb2c", "type": "execution" }
  ]
}
```

- `resource` is what changed: `enrollment`, `enrollment.task`, `execution`, `transaction`, `destination` (ping) or `app`.
- `relatedResources` appears on task, transaction and app events. On `transaction.processed` the `transaction.x12.<set id>` entry (`837`, `835`, `277`) identifies the transaction type and the `execution` entry is the file. Task events put the enrollment ID there. App events put the account and `app.client` there.
- Before acting, call the Stedi API for the resource's current state. Events can arrive out of order.

## Delivery Headers

| Header | Meaning |
|--------|---------|
| `webhook-id` | `msg_{UUID}`; dedupe key, same on retries |
| `webhook-timestamp` | When Stedi created the event |
| `webhook-signature` | `v1,{signature}` (see [verification](verification.md)) |
| `event-id` | `evt_{UUID}` |
| `destination-id` | `dst_{UUID}` |
| `attempt-number` | 1 for the first delivery |
| `attempt-type` | `AUTOMATIC` or `MANUAL` |
| `user-agent` | `Stedi-Events/1.0 (...)`; the `Stedi-Events/` prefix is stable |

## Retries

Only `2xx` is success. Redirects, 4xx, 5xx and network errors fail. Stedi retries after 5 minutes, 30 minutes, 2 hours, 8 hours, 24 hours and 48 hours, then disables the destination. Manual retries restart that schedule. Events and attempts are kept for 30 days, and `List Event Destination Events` (filter `FAILED`) lets you recover anything missed.

## Full Event Reference

For the complete list of events, see [Stedi's event types documentation](https://www.stedi.com/docs/healthcare/event-destinations-event-types).
