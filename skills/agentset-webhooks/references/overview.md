# Agentset Webhooks Overview

## What Are Agentset Webhooks?

Agentset (agentset.ai) is a managed RAG platform. Organization webhooks notify your server when a
document or an ingest job changes state, so you don't have to poll. You create them in the dashboard
(Webhooks settings) with a URL, the events you want and optional namespaces. Each delivery is signed
with an `agentset-signature` header (hex HMAC-SHA256 of the raw body).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `document.queued` | A document is queued for ingestion | Show "pending" in your UI |
| `document.queued_for_resync` | A document is queued for re-sync | Track refreshes |
| `document.queued_for_deletion` | A document is queued for deletion | Hide it from results |
| `document.processing` | A document starts processing | Progress indicators |
| `document.ready` | A document is ingested and searchable | Enable search, notify the user |
| `document.error` | Ingestion failed (`data.error`) | Alert, show the reason, retry |
| `document.deleted` | A document was deleted | Clean up local records |
| `ingest_job.queued` | An ingest job is queued | Track crawls and imports |
| `ingest_job.queued_for_resync` | An ingest job is queued for re-sync | Track refreshes |
| `ingest_job.queued_for_deletion` | An ingest job is queued for deletion | Track cleanup |
| `ingest_job.processing` | An ingest job starts running | Progress indicators |
| `ingest_job.ready` | An ingest job completed | Mark an import done |
| `ingest_job.error` | An ingest job failed (`data.error`) | Alert and retry |
| `ingest_job.deleted` | An ingest job was deleted | Clean up local records |

## Event Payload Structure

Every delivery is an envelope with a top-level `event`:

```json
{
  "id": "evt_pqr678stu901",
  "event": "document.ready",
  "createdAt": "2024-08-26T16:50:00.000Z",
  "data": {
    "id": "doc_k8f2m9x3n4p1",
    "name": "product-guide.pdf",
    "namespaceId": "ns_j7h3k9m2n5p8",
    "organizationId": "org_x9y8z7w6v5u4",
    "status": "READY",
    "source": { "type": "FILE", "fileUrl": "https://example.com/sample.pdf" },
    "totalCharacters": 45230,
    "totalChunks": 32,
    "totalPages": 15,
    "error": null,
    "createdAt": "2024-08-26T16:41:52.084Z",
    "updatedAt": "2024-08-26T16:50:00.000Z"
  }
}
```

`ingest_job.*` events carry the job in `data` (`id`, `name`, `namespaceId`, `organizationId`,
`status`, `error`, `createdAt`, `updatedAt`). Treat every field as untrusted until you've checked its type.

## Delivery

2xx within 20 seconds, else up to 10 retries with exponential backoff capped at 24 hours
(12 s, 2m24s, 30m8s, ...). Owners are emailed after 5, 10 and 15 consecutive failures and the 20th
disables the webhook.

## Full Event Reference

See [Agentset's webhook documentation](https://docs.agentset.ai/webhooks).
