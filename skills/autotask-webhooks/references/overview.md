# Autotask Webhooks Overview

## What Are Autotask Webhooks?

Autotask PSA (Datto, now Kaseya) sends an HTTP POST with a JSON payload to your webhook URL when a record changes. Webhooks are created and managed entirely through the Autotask API (SOAP 1.6+ or REST 1.0+); the Autotask UI only offers a read-only list. Callouts arrive on port 443 and typically fire within a minute of the trigger, up to five minutes under heavy load.

## Supported Entities

Companies (Accounts), Contacts, Assets (Configuration Items), Tickets and Ticket Notes (Tickets and Ticket Notes are REST only for Taskfire-created records).

## Event Types

Autotask does not send an event-name string. Dispatch on `EntityType` plus `Action`:

| `Action` | Triggered When | Common Use Cases |
|----------|----------------|------------------|
| `Create` | A record is created | Sync new companies/contacts, alert on new tickets |
| `Update` | At least one subscribed field or UDF changes | Mirror ticket status, sync contact details |
| `Delete` | A record is deleted | Remove the record downstream |
| `Deactivated` | The webhook is deactivated (for example after repeated delivery failures) | Re-enable the webhook, alert an admin |

`EntityType` values used in the examples: `Company`, `Contact`, `Ticket`, `TicketNote`.

## Event Payload Structure

| Field | Description |
|-------|-------------|
| `Action` | `Create`, `Update`, `Delete` or `Deactivated` |
| `Guid` | Globally unique identifier of the callout; for `Deactivated` callouts it identifies the webhook |
| `EntityType` | The Autotask entity the callout is for |
| `Id` | Unique identifier of the record in Autotask |
| `Fields` | Create: subscribed non-null fields and UDFs. Update: fields and UDFs that changed. Delete/Deactivated: empty (base payload only) |
| `EventTime` | When the webhook fired |
| `SequenceNumber` | Increasing callout counter; gaps mean callouts went to the error log |
| `PersonID` | Resource ID of the user whose action fired the callout |

## Limits

- 50 active webhooks per entity per site.
- Above 1,500 callouts per rolling hour per entity, further callouts queue until you fall below the threshold.
- Webhooks only fire if the webhook owner has permission to the record (security level and Line of Business apply).

## Full Event Reference

See [Autotask webhooks](https://www.autotask.net/help/developerhelp/Content/APIs/Webhooks/Webhooks.htm) and [Creating a webhook](https://www.autotask.net/help/developerhelp/Content/APIs/Webhooks/Webhooks_Creating.htm).
