# Kombo Webhooks Overview

## What Are Kombo Webhooks?

Kombo is a unified API for HRIS, ATS and LMS integrations. It sends **downstream
webhooks** to your system so you don't have to poll for changes: new data,
new or broken integrations, issues, and assessment orders. (Webhooks Kombo
*receives* from tools like Personio are "upstream webhooks" and are a separate topic.)

Every request is a `POST` with a JSON body signed in the `X-Kombo-Signature` header.

## Common Event Types

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `data-changed` | Data changes in Kombo (regular syncs or upstream webhooks). Debounced: at most one per 30 seconds | Fetch only updated data with `updated_after` |
| `sync-finished` | A sync finishes, any state (`SUCCEEDED`, `PARTIALLY_FAILED`, `FAILED`, `TIMED_OUT`, `CANCELLED`, `AUTHENTICATION_FAILED`). **Deprecated** | Existing setups only; use `data-changed` |
| `integration-created` | An integration is created | Store the integration in your database |
| `integration-deleted` | An integration is deleted | Remove the integration and its data |
| `integration-state-changed` | Integration `state` changes (`ACTIVE`, `INVALID`, `INACTIVE`) | Detect stale credentials, prompt reconnection |
| `connection-flow-failed` | An error occurs in the connection flow (the flow can still succeed afterwards) | Analytics and support; not an alert |
| `issue-status-changed` | Kombo raises or resolves an issue (`change`: `raised` or `resolved`) | Surface integration issues to customers |
| `assessment:order-received` | An assessment is ordered for a candidate from the end customer's tool | Start an assessment for the candidate |

## Event Payload Structure

```json
{
  "id": "5gjAtURLPbnTiwgkaBfiA3WJ",
  "type": "integration-state-changed",
  "data": {
    "integration_tool": "personio",
    "integration_category": "HRIS",
    "integration_id": "personio:CBNMt7dSNCzBdnRTx87dev4E",
    "end_user": { "origin_id": "36123", "creator_email": "user@example.com", "organization_name": "Acme, Inc." },
    "state": "ACTIVE",
    "qa_status": "PASSED",
    "setup_status": "COMPLETED",
    "updated_at": "2021-09-01T12:00:00.000Z"
  }
}
```

- `id`: webhook event id (use for idempotency)
- `type`: event name
- `data`: event-specific; `data-changed` carries `integration_id`, `integration_tool`, `integration_category` and `changed_models` (e.g. `[{ "name": "ats_applications" }]`)

`issue.type` values in `issue-status-changed` are an open set that Kombo extends over time.

## Full Event Reference

For the complete list of events, see [Kombo's webhook documentation](https://docs.kombo.dev/hris/guides/webhooks).
