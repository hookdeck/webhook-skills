# Reducto Webhooks Overview

## What Are Reducto Webhooks?

Reducto is a document ingestion API (parse, extract, split, pipelines). Large
documents are processed asynchronously: you submit a job to an `*_async`
endpoint and Reducto notifies you when it finishes instead of you polling.

For production, Reducto delivers these notifications through **Svix**, which
adds request signing, automatic retries with exponential backoff, and a delivery
dashboard. (Reducto also has unsigned "Direct Webhooks" for prototyping; this
skill covers the signed Svix mode.)

Webhooks work with all async endpoints:

- `/parse_async`
- `/extract_async`
- `/split_async`
- `/pipeline_async`

## What Events Does Reducto Send?

Reducto sends a single Svix event type, **`async.update`**, when a job reaches
a terminal state. The event type is visible in the Svix dashboard; the request
body itself has no `type` field. Branch on the body's `status`:

| Status | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `Completed` | The async job finished successfully | Fetch results via `job_id`, store parsed/extracted data, notify the user |
| `Failed` | The async job failed | Log the failure, alert, resubmit the job |

## What Does the Payload Look Like?

```json
{
  "status": "Completed",
  "job_id": "a1b9090e-c9ae-420b-9726-f658afbbe338",
  "metadata": {
    "user_id": "123",
    "document_type": "invoice"
  }
}
```

| Field | Description |
|-------|-------------|
| `status` | `Completed` or `Failed` |
| `job_id` | ID of the async job — use it to retrieve results |
| `metadata` | Echo of the `async.metadata` object you supplied when submitting the job |

The webhook does **not** contain the job results. Retrieve them with the
Reducto API, e.g. `client.job.get(job_id)` (Python) or
`client.job.retrieve(job_id)` (TypeScript).

## Delivery Behaviour

- Respond with a 2xx within **15 seconds**; do heavy work asynchronously.
- Svix retries failed deliveries — use the `svix-id` header as an idempotency key.
- Failed messages can be replayed from the Svix dashboard ("Resend").
- Use **channels** (`async.webhook.channels`) to route jobs to specific endpoints, e.g. `production` vs `development`.

## Full Reference

See [Reducto's Svix webhooks documentation](https://docs.reducto.ai/workflows/svix-webhooks).
