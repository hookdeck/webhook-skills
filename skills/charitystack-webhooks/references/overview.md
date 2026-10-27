# CharityStack Webhooks Overview

## What Are CharityStack Webhooks?

CharityStack is an online fundraising platform for nonprofits. Webhooks register through its API (`POST /v1/webhooks`) and report donations, recurring subscriptions, contacts and forms. When a subscribed event occurs, CharityStack sends an HTTP `POST` with a JSON payload to the `url` you registered.

A webhook object (from `GET /v1/webhooks`) has `webhookId`, `url`, `events`, `status` (`ACTIVE`, `DISABLED` or `DELETED`), `description`, `createdAt`, `lastDeliveryAt`, `successCount` and `failureCount`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `donation.created` | A new donation is received | Thank-you email, CRM sync, receipts |
| `donation.updated` | A donation's status changes | Refund or status reconciliation |
| `subscription.created` | A new recurring subscription is started | Welcome flow for monthly donors |
| `subscription.updated` | A subscription is modified (e.g. amount changed) | Keep recurring amounts in sync |
| `subscription.cancelled` | A subscription is cancelled | Retention outreach |
| `subscription.payment_method_updated` | A payment method is updated through a hosted update link | Clear a "card failing" flag |
| `contact.created` | A new contact is added | Add to mailing list or CRM |
| `contact.updated` | A contact's information is updated | Keep contact records in sync |
| `form.created` | A new form is created | Track new campaign forms |
| `form.updated` | A form's configuration changes | Track form changes |

When a hosted payment method update link completes, CharityStack emits `subscription.payment_method_updated` and also `subscription.updated` for backward compatibility. The dedicated event includes a safe summary and excludes provider identifiers. If you subscribe to both, handle the pair without double counting.

## Event Payload Structure

The body is JSON and the event type is in its `type` field. The documentation pages this skill is based on don't list the other payload fields per event, so inspect a real delivery (the Hookdeck CLI shows them) before relying on a field.

Headers on every delivery:

| Header | Value |
|--------|-------|
| `X-Webhook-Signature` | `sha256=<hex_digest>` |
| `X-Webhook-Timestamp` | Unix timestamp (seconds) of when the request was signed |
| `X-Webhook-ID` | Unique identifier for this delivery attempt |

## Delivery

No retry or timeout policy is documented. Respond with a `2xx` quickly and process asynchronously. The webhook object's `successCount` and `failureCount` show how deliveries are going.

## Full Event Reference

For the complete list of events, see [CharityStack's webhook documentation](https://www.charitystack.com/docs/concepts/webhooks).
