# Sovos Webhooks Overview

## What Are Sovos Webhooks?

Sovos's Indirect Tax API (e-invoicing, Compliance Network) creates a
**notification** each time a document moves through its lifecycle: transmission,
tax-authority approval, rejection, and so on. You can poll for these with
`GET /notifications/{countryCode}`, or have Sovos push them to your ERP endpoint
as webhooks.

Push delivery runs on [Svix](https://www.svix.com/). Sovos hands each
notification to Svix, and Svix:

- signs it (`svix-id`, `svix-timestamp`, `svix-signature`)
- retries failed deliveries with exponential backoff
- throttles to the per-endpoint messages-per-second you set
- shows delivery logs, test events, and manual retries in the **Svix Consumer App Portal**

The Sovos communication method for this is `pushingV2`.

## What Does Sovos Require From Your Endpoint?

From Sovos's prerequisites, your endpoint must:

- accept `POST` requests with a JSON body
- use HTTPS
- use an authentication layer (Svix signature verification, plus optional OAuth / mTLS / custom headers configured in the portal)
- respond within **30 seconds**
- return a **2xx** status for a successful receipt
- handle duplicate deliveries (be idempotent)
- verify the message with the Svix library or Svix's manual procedure

## Common Event Types

The event is identified by the top-level `eventType` field. Events are chosen
per ERP system (`systemId`) on the Sovos side, as `statusEvent` values in the
`events` configuration. You cannot add or filter events in the Svix portal.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `document.received` | A document notification is produced during processing (the documented webhook payload example) | Record the new status against the ERP document, fetch `contentUrl` |
| `document.completed` | A document reaches the end of its lifecycle | Mark the invoice final, archive legal attachments |
| `workflow.completed` | A document's processing workflow completes | Close out the ERP task, download `Legal` / `LegalResponse` attachments |
| `system.error` | Sovos hit a system error processing the document | Alert, flag the document for resubmission |

Note on naming: Sovos's configuration sample *sends* `workflow.completed` but the
sample *response* echoes `document.completed`. Both names appear in the docs, so
the examples handle both. Sovos does not publish a complete event catalog on its
webhook pages; check with Sovos Professional Services for the names enabled for
your account, and always keep a default branch.

## Event Payload Structure

```json
{
  "appPrefix": "DLT",
  "contentUrl": "https://uat-einvoicing-api-emea.sovos.com/download/api/v1/download/notification/P4pob2kFJrwkgZ04...",
  "correlationId": "822431a1-ef99-4ef7-8dfa-38f9c6b6b0af-mock",
  "createdDate": 1770290583638,
  "eventType": "document.received",
  "metadata": {
    "documentId": "4e9528cdc7cbe2e5444a70b9a4314bcb",
    "erpDocumentId": "#BC-UAT-MOCK582230",
    "erpSystemId": "TestSystemId",
    "processType": "0",
    "productId": "WA_SPARK__2.0",
    "sciCloudStatusCode": "100",
    "sciGovtStatusCode": null,
    "sciResponseCode": "IP",
    "sciStatusAction": "NOA",
    "taxId": "WA_SPARK_TaxId",
    "transactionId": "7d7f0b4f-f60f-4be3-931f-b5ba8ab26ca6"
  },
  "notificationId": "bd92d169-7ec0-4f21-a7eb-e2238070d9d7",
  "orgId": "faf412ed-bb3f-4e2c-9c7e-6bcf280e1ccf"
}
```

| Field | Description |
|-------|-------------|
| `eventType` | Event name, e.g. `document.received` |
| `notificationId` | Unique notification ID (good idempotency key) |
| `correlationId` | Correlation ID for the request that produced the notification |
| `createdDate` | Creation time in **milliseconds** since epoch in the webhook sample |
| `appPrefix` | Application prefix (e.g. `DLT`, `INV`) |
| `contentUrl` | Download link for the application response, when `appResponseAsLink` is `true` |
| `orgId` | Sovos organization ID |
| `metadata.documentId` | Sovos-generated document ID |
| `metadata.erpDocumentId` | Your ERP document reference |
| `metadata.erpSystemId` | ERP system that submitted the document |
| `metadata.processType` | `"0"` = outbound, `"1"` = inbound |
| `metadata.sciCloudStatusCode` | Current processing status |
| `metadata.sciResponseCode` | Overall compliance status (e.g. `IP`, `AP`) |
| `metadata.sciGovtStatusCode` | Tax-authority response code (may be `null`) |
| `metadata.sciStatusAction` | Action required (e.g. `NOA`) |

`productId`, `documentId`, `erpDocumentId`, `erpSystemId`, and `processType`
are always present; the status fields and `taxId` depend on the processing stage.

## Full Event Reference

- [Using webhooks for event notifications](https://docs.sovos.com/en/e-invoicing/indirect-tax-api/how-indirect-tax-api-works/using-webhooks-for-event-notifications)
- [Configure the webhook communication method](https://docs.sovos.com/en/e-invoicing/indirect-tax-api/how-indirect-tax-api-works/using-webhooks-for-event-notifications/configure-the-webhook-communication-method)
- [Check notifications](https://docs.sovos.com/en/e-invoicing/indirect-tax-api/how-indirect-tax-api-works/check-notifications) (metadata field definitions)
