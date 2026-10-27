# sajn Webhooks Overview

## What Are sajn Webhooks?

[sajn](https://sajn.se) is a Swedish e-signature and identity-check platform. A webhook sends a signed HTTPS `POST` to your server when something happens in a sajn workspace: a party signs, a document is sealed, an invitation bounces, an identity check completes, a form is submitted. An endpoint receives the events of one workspace, or of every workspace in the organization (API version `2026-10`, created in the dashboard by an organization administrator; read `workspaceId` to tell them apart).

Webhooks are part of API access (Team plan or higher; a sandbox organization always has it). sajn signs them with [Standard Webhooks](https://www.standardwebhooks.com). See [verification.md](verification.md).

## What Does a Delivery Look Like?

`POST` with `Content-Type: application/json` and these headers: `webhook-id`, `webhook-timestamp`, `webhook-signature` and `Sajn-Version`. The body is the event:

```json
{
  "id": "cm4k2x9p10014abcd1234efgh",
  "type": "document.completed",
  "createdAt": "2026-10-01T09:30:00.000Z",
  "apiVersion": "2026-10",
  "workspaceId": "cm4k2x9p10001abcd1234efgh",
  "environment": "PRODUCTION",
  "actor": null,
  "data": {
    "object": { "id": "cm4k2x9p10003abcd1234efgh", "status": "COMPLETED" }
  }
}
```

| Field | Notes |
|-------|-------|
| `id` | Event ID, the same on every retry, replay and endpoint. Dedupe on it. Equals `webhook-id` |
| `type` | Dotted lowercase event name, e.g. `document.party.signed` |
| `createdAt` | When the event happened (not when the attempt was sent). Doesn't change across retries |
| `apiVersion` | The endpoint's API version. It sets the shape of `data` |
| `workspaceId` / `environment` | Source workspace; `SANDBOX` or `PRODUCTION` |
| `actor` | `{ type, id }` (`USER`, `API_KEY`, `OAUTH_APP`, `SYSTEM`) or `null` |
| `data.object` | The resource, as the REST API returns it. Some events add `data.party`, `data.previousAttributes`, `data.source` and similar |

**API version 2026-09** (deprecated) uses a different body, `{ event, payload, createdAt, webhookEndpoint, apiVersion }`, with uppercase names (`DOCUMENT_COMPLETED`; `DOCUMENT_SIGNED` is `document.fully_signed`; identity checks are `ID_*`) and signs with `X-Sajn-Signature`. Create the sajn webhook endpoint on API version 2026-10 or later. Endpoints on the deprecated 2026-09 version sign with X-Sajn-Signature instead of Standard Webhooks and fail verification.

## Common Event Types

The examples handle these. The type is the top-level `type` field.

| Event | Fires when |
|-------|------------|
| `document.sent` | The document is sent to its parties |
| `document.fully_signed` | Every party has signed. The PDF is **not sealed yet** |
| `document.completed` | sajn sealed the signed PDF. Download the signed file on this event |
| `document.rejected` | A party rejects the document, ending signing |
| `document.expired` / `document.expiring_soon` | A pending document passed its expiration date / expires in about a day |
| `document.withdrawn` | The sender withdraws a sent document (back to `DRAFT`) |
| `document.party.signed` | A party signs (`data.party` is the party) |
| `document.party.rejected` | A party rejects the document |
| `document.party.delivery_failed` | A party's invitation email bounces or SMS fails |
| `approval_request.created` / `.approved` / `.rejected` / `.cancelled` | Internal approval of a document moves |
| `identity_check.verified` / `identity_check.failed` | An identity check completes / fails (`data.failureReason`) |
| `form.submitted` | A respondent submits a public form |
| `usage.limit_reached` | The organization reaches a monthly document or eID signature quota |
| `webhook.test` | Sent only by `POST /api/v1/webhooks/{id}/test`; can't be subscribed to |

## Full Event List

64 documented types (sajn adds more without a new API version, so acknowledge unknown ones with `2xx`):

- **Document (15):** `document.created`, `document.sent`, `document.fully_signed`, `document.completed`, `document.rejected`, `document.expired`, `document.expiring_soon`, `document.expiration_extended`, `document.withdrawn`, `document.updated`, `document.deleted`, `document.restored`, `document.archived`, `document.unarchived`, `document.comment.created`
- **Party (13):** `document.party.sent`, `document.party.delivery_failed`, `document.party.opened`, `document.party.read`, `document.party.verified`, `document.party.auth_failed`, `document.party.signed`, `document.party.rejected`, `document.party.delegated`, `document.party.updated`, `document.party.added`, `document.party.removed`, `document.party.reminded`
- **Approval (4):** `approval_request.created`, `approval_request.approved`, `approval_request.rejected`, `approval_request.cancelled`
- **Identity check (6):** `identity_check.created`, `identity_check.sent`, `identity_check.opened`, `identity_check.verified`, `identity_check.failed`, `identity_check.cancelled`
- **Contact and company (6):** `contact.created`, `contact.updated`, `contact.deleted`, `company.created`, `company.updated`, `company.deleted`
- **Template and form (5):** `template.created`, `template.updated`, `template.deleted`, `template.restored`, `form.submitted`
- **Workspace and usage (5):** `workspace.created`, `member.invited`, `member.invite_accepted`, `member.added`, `usage.limit_reached`
- **Security (7):** `security.document_downloaded`, `security.documents_exported`, `security.signature_identity_accessed`, `security.member_removed`, `security.member_role_changed`, `security.role_updated`, `security.workspace_retention_updated`
- **sajn Login (2):** `login.completed`, `login.failed`
- **Test (1):** `webhook.test`

The authoritative list is [Webhook events](https://docs.sajn.se/webhooks/events) and the per-event pages under [API reference > Webhook events](https://docs.sajn.se/api-reference/webhook-events/documentcompleted).

## How Does Delivery Behave?

- Return a `2xx` within **30 seconds**. Enqueue the event and process it asynchronously.
- **Up to 12 attempts over about three days:** immediately, then waits of 6 s, 36 s, about 4 min, about 22 min, about 2 h, then 12 h each.
- `410 Gone` stops retries and pauses the endpoint. `429` honours `Retry-After` (60 s without one). Redirects are not followed; any other non-2xx retries.
- An endpoint is also paused when every attempt fails for 72 hours with at least 5 failures in a row. Reactivate it after fixing the receiver. Reactivating doesn't resend missed events; retry them from the delivery log (kept 7 days) or read `GET /api/v1/events` (30 days).
- **At least once and unordered.** `document.party.signed` can arrive after `document.completed`. Compare `createdAt` or read current state from the API before overwriting newer data.
- `data.object` is a snapshot as of the event.
