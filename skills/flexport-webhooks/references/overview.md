# Flexport Webhooks Overview

## What Are Flexport Webhooks?

Flexport webhooks notify your application about freight and logistics milestones
as they happen — a shipment is created, a leg departs or arrives, a container is
loaded, a document is generated, an invoice is paid. Instead of polling the
Flexport API, you register an HTTPS endpoint and Flexport POSTs a Flexport
**Event** object to it whenever a subscribed milestone occurs.

Each delivery is signed with an HMAC of the raw request body so you can verify it
came from Flexport. See [verification.md](verification.md).

## The Event Object

The webhook body is a Flexport **Event** object. Dispatch on the `type` field,
which is the milestone identifier in `/object#event` format (for example
`/shipment#created`) — **not** `object.event`. The affected object lives under
`data`.

| Field | Description |
|-------|-------------|
| `_object` | Object type marker (e.g. `/event`) |
| `id` | Unique event ID (use for idempotency/deduplication) |
| `version` | API version |
| `created_at` | When the event record was created |
| `occurred_at` | When the underlying milestone occurred |
| `type` | Milestone identifier, e.g. `/shipment_leg#departed` |
| `data` | Event data. For shipment, leg and container milestones, a Shipment Event Data object with `resource`, `shipment` and `location` (place name at `location.place.name`); invoice, document, purchase order and container load result events have their own data objects |

Envelope from Flexport's Events API example (`data` abridged here):

```json
{
  "_object": "/event",
  "id": 354987,
  "version": 2,
  "created_at": "2019-04-16T18:05:10.964Z",
  "occurred_at": "2019-04-16T18:05:10.964Z",
  "type": "/shipment_leg#departed",
  "data": { "_object": "/shipment_event_data", "resource": {}, "shipment": {}, "location": {} }
}
```

## Common Event Types

> All rows below are documented types on Flexport's
> [Milestones page](https://apidocs.flexport.com/v2/tag/Milestones/), which lists
> over 200 types, most of them delay, hold and exception codes.

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `/shipment#created` | A shipment is created (quote confirmed) | Kick off internal order/shipment records |
| `/shipment#booking_confirmed` | Air carrier confirms the booking | Notify stakeholders, update ETAs |
| `/shipment#delivered_in_full` | Entire shipment is delivered | Close out orders, trigger billing |
| `/shipment_leg#departed` | A shipment leg departs its origin | Update in-transit status, notify customers |
| `/shipment_leg#arrived` | A shipment leg arrives at its destination | Trigger customs/last-mile workflows |
| `/document#document_created` | A document is created (needs account-level activation) | Sync commercial invoices, BOLs, packing lists |
| `/invoice#invoice_payment_made` | An invoice payment is processed | Reconcile accounts payable |
| `/purchase_order#acknowledged` | A purchase order is acknowledged | Advance procurement workflows |

Flexport groups milestones into Estimated Transit, Actual Transit,
Administrative, Invoice, Document, PurchaseOrder, Container Load Result and (in
newer API versions) Customs Filing and Async API events. Milestones marked with an
asterisk are **available upon request**, and selecting a category in your webhook
settings doesn't activate them: ask your Flexport team.

## Full Event Reference

For the complete list of milestones, see
[Flexport Milestones](https://apidocs.flexport.com/v2/tag/Milestones/). Signing is on
[Webhook Endpoints](https://apidocs.flexport.com/v2/tag/Webhook-Endpoints/).

## Note: Logistics API is a separate product

Flexport also ships a newer **Logistics API** (`docs.logistics-api.flexport.com`)
with its own `POST /logistics/api/{version}/webhooks`, `Order.*`/`Shipment.*`
event names in a `logisticsEventType` field, and a different envelope. Its
webhooks carry no signature: they authenticate with Basic auth or a token header
you choose when you create them. This skill targets the Flexport API webhooks (the
`/object#event` milestone model with `X-Hub-Signature-256`).
