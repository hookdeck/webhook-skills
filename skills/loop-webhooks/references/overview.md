# Loop Webhooks Overview

## What Are Loop Webhooks?

Loop (loop.com) is a freight audit and logistics payments platform. Its
webhooks notify your application when payments move, invoices change state,
shipment jobs are normalized or rerated, documents finish processing, or
business exceptions are raised. Loop delivers them through **Svix**: each
webhook is an HTTP `POST` with a JSON body and `svix-id`, `svix-timestamp` and
`svix-signature` headers.

Not to be confused with Loop Returns or Loop Subscriptions, which are Shopify
apps from different companies.

## What Does a Loop Webhook Payload Look Like?

Payloads are flat. There is no `type`/`data` envelope; three common fields sit
at the top level beside the event-specific fields:

| Field | Description |
|---|---|
| `eventType` | The event type, e.g. `payment.completed` |
| `eventId` | Stable ID of the logical event. Use it to deduplicate |
| `eventCreatedAt` | ISO 8601 time the event was created. Use it to order events |

Entities are referenced by **QIDs** such as
`qid::payment:0ca6f700-4137-4d09-b44a-43bb8d7900c4`. Payloads are deliberately
thin: Loop recommends treating them as notifications and fetching current
state from the Loop API.

```json
{
  "eventCreatedAt": "2023-01-01T00:00:00.000Z",
  "eventId": "JG6_GkHkURAUFawN4JTV_4UPaTNvWbIU1KAcgsvuv1s",
  "eventType": "receivable-invoice.voided",
  "receivableInvoiceQid": "qid::receivable_invoice:0ca6f700-4137-4d09-b44a-43bb8d7900c4",
  "voidReason": "INTERNAL_PRICING_ERROR",
  "voidReasonNote": "The invoice was created in error."
}
```

## Which Event Types Does Loop Send?

From Loop's [Webhook event types](https://docs.loop.com/developers/webhook-event-types) catalog:

| Event | Triggered When | Event-specific fields |
|---|---|---|
| `payment.initiated` | A payment was initiated | `paymentQid`, `paymentDisplayId`, `initiatedAt` |
| `payment.completed` | A payment was completed | `paymentQid`, `paymentDisplayId`, `initiatedAt`, `completedAt` |
| `payment.failed` | A payment failed | `paymentQid`, `paymentDisplayId`, `initiatedAt`, `failedAt` |
| `receivable-invoice.created` | A receivable invoice was created | `receivableInvoiceQid` |
| `receivable-invoice.finalized` | A receivable invoice was finalized | `receivableInvoiceQid` |
| `receivable-invoice.voided` | A receivable invoice was voided | `receivableInvoiceQid`, `voidReason`, `voidReasonNote` |
| `payable-invoice-review.completed` | A payable invoice review was completed | `payableInvoiceQid`, `outcome` (e.g. `FULLY_APPROVED`), `auditStatus`, `approvedTotalAmount`, `lastMarginalApprovalAmount` |
| `payable-invoice.shipment-job-linked` | A payable invoice was linked to a shipment job | `payableInvoiceQid`, `shipmentJobQid` |
| `payable-invoice.shipment-job-unlinked` | A payable invoice was unlinked from a shipment job | `payableInvoiceQid`, `shipmentJobQid` |
| `shipment-job.normalized` | A shipment job was normalized | `shipmentJobQid` |
| `shipment-job.rerated` | A shipment job was rerated | `shipmentJobQid` |
| `shipment-job-artifact.assigned` | A shipment job artifact was assigned | `artifactQid`, `shipmentJobQid` |
| `shipment-job-artifact.unassigned` | A shipment job artifact was unassigned | `artifactQid`, `shipmentJobQid` |
| `shipment-job-artifact.assessed` | A shipment job artifact was assessed | `artifactQid`, `shipmentJobQid`, `artifactAssessedType` (e.g. `PROOF_OF_DELIVERY`) |
| `shipment-job-artifact.unassessed` | A shipment job artifact was unassessed | `artifactQid`, `shipmentJobQid`, `artifactAssessedType` |
| `artifact.root-ingestion-completed` | A root artifact (not a derived one) finished all ingestion steps: preprocessing, screening, categorization and normalization | `artifactQid` |
| `business-exception.created` | An exception was created on an entity | `qid`, `exceptionName`, `exceptionTypeQid`, `targetEntityQid`, `targetEntityType` (e.g. `PAYABLE_INVOICE`) |
| `business-exception.resolved` | An exception was resolved on an entity | same as above |
| `business-exception.reopened` | An exception was reopened on an entity | same as above |
| `business-exception.deleted` | An exception was deleted from an entity | same as above |
| `quick-pay-relationship.revised` | A QuickPay relationship was created, changed, or ended | `payeeOrganizationQid`, `payorOrganizationQid` (fetch the payee's `activeQuickPayRelationships` for current state) |
| `test-event.created` | Used for testing only | `optionalString`, `randomUuid` |

Amounts are objects with a string `amount` and a `currencyCode`:
`{"amount": "3.50", "currencyCode": "USD"}`.

> The prose example of `test-event.created` on Loop's webhooks page shows a
> `generatedAtTimestamp` field and no `eventType`. The event type catalog's
> schema, which this skill follows, has `eventType` and `eventCreatedAt`.
> Handlers should not assume either way for that one test event.

## How Should I Deduplicate Loop Webhooks?

Loop delivers **at least once**. It deduplicates identical `eventId`s on its
side, but asks clients to deduplicate too:

- Use the payload's **`eventId`**. It stays the same if Loop resends an event.
- Do **not** use the `svix-id` header. It identifies one delivery message and
  can change when Loop resends an event.
- Loop's docs say payloads "may carry" `eventId`; handle its absence.

## Are Loop Webhooks Delivered in Order?

No. Svix doesn't guarantee ordering. Loop suggests either tracking the latest
`eventCreatedAt` per entity (and refetching when a newer one arrives) or
refetching the entity from the API after every event.

## What Is Loop's Retry Schedule?

A delivery succeeds when your endpoint returns `2xx` within 15 seconds. Failed
deliveries are retried by Svix after: immediately, 5 seconds, 5 minutes,
30 minutes, 2 hours, 5 hours, 10 hours, 10 hours. An endpoint whose attempts
all fail for 5 days is disabled. Failed messages can be resent one at a time or
recovered in bulk from the portal (see [setup.md](setup.md)).

## Full Event Reference

- [Loop webhooks](https://docs.loop.com/developers/webhooks)
- [Loop webhook event types](https://docs.loop.com/developers/webhook-event-types)
