# Pleo Webhooks Overview

## What Are Pleo Webhooks?

Pleo is a spend management platform (company cards, expenses, invoices, reimbursements). Its webhooks send real-time notifications to third-party integrations, mostly accounting and ERP connectors, when something happens in a customer's Pleo account. Instead of polling `GET /v2/export-jobs` or `POST /v1/vendors:search`, an integration subscribes to events and Pleo `POST`s a JSON payload to the endpoint.

Key points:

- **Subscriptions are created through the API**, not a dashboard: `POST https://external.pleo.io/v1/subscriptions`. One subscription can cover several event types.
- **Per entity.** A subscription is tied to the company or organisation that the API key or OAuth token belongs to. In a multi-entity setup, create one subscription per entity with that entity's credentials.
- **Delivered through Svix**, with Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`).
- **Event types are versioned**: `v1.<resource>.<action>`, for example `v1.export-job.created`.

## Event Types

Pleo's [Webhook Events](https://developers.pleo.io/reference/webhooks/webhook-events) reference lists these events:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `v1.export-job.created` | A user clicks **Export** in Pleo and an export job is created in `pending` status | Start pulling export items and pushing them to the accounting system or ERP |
| `v1.vendor.created` | A vendor is created in Pleo that doesn't exist yet in the accounting system (`state: "DRAFT"`) | Create the vendor in the accounting system, then activate it in Pleo |

> **Naming gotcha:** the prose on Pleo's events page writes the export event as `v1.export.job-created`, but the payload example, the subscription examples and the Subscriptions API OpenAPI spec all use **`v1.export-job.created`**. Subscribe to and match on `v1.export-job.created`.

New event types are added over time. Check the events page, and acknowledge unknown `eventType` values with `200` so new events don't cause retries.

## Event Payload Structure

The request body is a JSON object with three fields. The signature headers travel as HTTP headers, not in the body (Pleo's docs show them merged with the body in one JSON block for illustration).

```json
{
  "data": {
    "companyId": "b5fdaec1-1b43-4b62-996a-b0471c3bb336",
    "createdAt": "2025-05-23T15:21:32Z",
    "createdBy": "e3118b03-691c-4bd4-944e-1a9c1f1031b7",
    "expiresIn": 3600,
    "id": "b4c4d068-ebbe-45b7-b562-2f16f0deb8b9",
    "numberOfItems": 1,
    "status": "pending"
  },
  "eventId": "a257a31e-e8a6-4c36-a98d-451250e5b5c4",
  "eventType": "v1.export-job.created"
}
```

| Field | Description |
|-------|-------------|
| `data` | The resource exactly as it was when the event was generated |
| `eventId` | Unique identifier of the event |
| `eventType` | The versioned event type |

### `v1.export-job.created` data

| Field | Description |
|-------|-------------|
| `id` | Export job ID |
| `companyId` | Company the export belongs to |
| `createdAt` / `createdBy` | When and by which user the export was started |
| `expiresIn` | Seconds until the export job expires |
| `numberOfItems` | Number of accounting entries selected for export |
| `status` | `pending` when the job has just started |

### `v1.vendor.created` data

```json
{
  "data": {
    "id": "c27ed4d6-3d3d-458e-8f3f-735fdf32a3bc",
    "companyId": "12abc3d4-e567-890e-1234-abc56e78fabc",
    "name": "Greenfield Logistics",
    "country": "GB",
    "registrationNumber": "",
    "taxRegistrationNumber": "GB987654321",
    "code": null,
    "state": "DRAFT",
    "defaultCurrency": "GBP",
    "createdBy": "22aff90a-a53d-4f0c-851f-dd4cc85ac947",
    "createdAt": "2026-07-08T10:05:43.530450712Z",
    "updatedAt": "2026-07-08T10:05:43.530450712Z",
    "deletedAt": null
  },
  "eventType": "v1.vendor.created",
  "eventId": "13d8550d-dd22-46e9-ae18-c171846ba373"
}
```

Pleo uses `""` for optional text fields never filled in (`registrationNumber`) and `null` for identifiers not yet assigned (`code` before activation). Treat both as "no value". The payload already contains the vendor details, so no extra fetch is needed.

## Delivery and Retries

- Respond with a `2xx` to acknowledge. Anything else, **including `3xx`**, counts as a failure.
- Failed deliveries are retried with exponential backoff: immediately, 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 10 hours. That's roughly **27.5 hours**, after which the message is dropped.
- The `webhook-id` header stays the same when a message is resent, so use it (or `eventId`) for idempotency.
- Pleo recommends a low-frequency backstop poll (for example hourly) even when using webhooks, since an endpoint that's down longer than the retry window loses those events.

## Full Event Reference

- [Webhooks overview](https://developers.pleo.io/reference/webhooks/overview-webhooks)
- [Webhook events](https://developers.pleo.io/reference/webhooks/webhook-events)
- [Subscriptions API](https://developers.pleo.io/reference/webhooks/subscriptions)
