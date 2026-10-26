# Column Webhooks Overview

## What Are Column Webhooks?

Column (column.com) is a developer-facing, nationally chartered bank with APIs for ACH, wires, RTP, checks, card issuing and loans. It sends webhooks to tell your server when something happens to a resource, such as an outgoing ACH transfer completing or being returned.

You create webhook endpoints through the API or the Dashboard with an `enabled_events` list (wildcards allowed). Each endpoint receives the event types it is subscribed to, and every endpoint has its own signing secret.

## Common Event Types

Event types are `{category}.{action}` or `{category}.{sub_category}.{action}`. Column documents 212. The examples handle the first three and log the rest.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ach.outgoing_transfer.completed` | An outgoing ACH transfer completed | Mark a payout as paid |
| `ach.outgoing_transfer.returned` | An outgoing ACH transfer was returned | Reverse the payout, notify the customer |
| `book.transfer.completed` | A book transfer between Column accounts completed | Update internal ledgers |
| `book.transfer.hold_created` | A book transfer created a hold | Show pending funds |
| `book.transfer.updated` | A book transfer changed | Sync state |
| `book.transfer.canceled` | A book transfer was canceled | Release reserved funds |
| `ach.outgoing_transfer.initiated` | An outgoing ACH transfer was created | Track lifecycle |
| `ach.outgoing_transfer.manual_review` | An outgoing ACH transfer went to manual review | Alert operations |
| `ach.outgoing_transfer.submitted` | An outgoing ACH transfer was submitted | Track lifecycle |
| `ach.outgoing_transfer.settled` | An outgoing ACH transfer settled | Reconciliation |
| `ach.outgoing_transfer.return_dishonored` | A return was dishonored | Investigate |
| `ach.outgoing_transfer.return_contested` | A return was contested | Investigate |
| `ach.outgoing_transfer.canceled` | An outgoing ACH transfer was canceled | Release reserved funds |
| `ach.outgoing_transfer.hold_created` | An outgoing ACH transfer created a hold | Show pending funds |

## Event Payload Structure

The body is JSON. Dispatch on the top-level `type`:

| Field | Description |
|-------|-------------|
| `id` | Event id (`evnt_...`), stable across redeliveries: use it to deduplicate |
| `type` | The event type |
| `data` | The resource as it was when the event fired |

No header names the event type. `Webhook-Endpoint-Id` names the endpoint that received the delivery.

## Retries and Delivery

- A `2xx` within 10 seconds acknowledges the delivery.
- Failures are retried up to 25 times within 3 days with exponential backoff, the first a minute later.
- Redeliveries keep the event `id`, and ordering is not guaranteed.

## Full Event Reference

For the complete list of events, see [Column's events and webhooks documentation](https://docs.column.com/markdown/working-with-the-api/events-and-webhooks).
