# Documenso Webhooks Overview

## What Are Documenso Webhooks?

[Documenso](https://documenso.com) is an open-source document signing platform. When something
happens to a document or template (it is sent, signed, completed, rejected...), Documenso sends
an HTTP POST with a JSON body to the URL configured on a webhook. Webhooks are available for
**teams only**; personal accounts can't configure them.

Things that differ from providers such as Stripe or GitHub:

- **No payload signature.** The secret is sent as plain text in the `X-Documenso-Secret` header,
  not used as an HMAC key. See [verification.md](verification.md).
- **The secret is optional in Documenso.** Without one the header is an empty string, so your
  endpoint must reject empty headers and require a secret of its own.
- **No event ID or timestamp header.** The body has `createdAt`, but nothing uniquely
  identifies a delivery, so make handlers idempotent (for example on `envelopeId` + `event`
  + the recipient's status).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `DOCUMENT_CREATED` | A new document is created | Track drafts |
| `DOCUMENT_SENT` | A document is sent to recipients | Mark as awaiting signature |
| `DOCUMENT_OPENED` | A recipient opens the document for the first time | Read receipts |
| `DOCUMENT_SIGNED` | A recipient signs the document | Per-signer progress |
| `DOCUMENT_RECIPIENT_COMPLETED` | A recipient completes their required action (sign, approve, view) | Per-recipient completion |
| `DOCUMENT_COMPLETED` | All recipients have completed their actions | Archive the signed PDF, start fulfilment |
| `DOCUMENT_REJECTED` | A recipient rejects the document | Notify the owner, read `rejectionReason` |
| `DOCUMENT_CANCELLED` | A pending document is cancelled, or an owner or team member deletes it | Clean up |
| `DOCUMENT_REMINDER_SENT` | A reminder email is sent to a recipient | Audit trail |
| `RECIPIENT_EXPIRED` | A recipient's signing deadline passes before they sign or reject | Follow up or resend |
| `TEMPLATE_CREATED` | A new template is created | Template sync |
| `TEMPLATE_UPDATED` | A template's settings, recipients or fields change | Template sync |
| `TEMPLATE_DELETED` | A template is deleted | Template sync |
| `TEMPLATE_USED` | A document is created from a template | Usage tracking |

## Event Payload Structure

```json
{
  "event": "DOCUMENT_COMPLETED",
  "payload": {
    "id": 10,
    "envelopeId": "envelope_abcdefhiklmnorst",
    "title": "contract.pdf",
    "status": "COMPLETED",
    "completedAt": "2024-04-22T11:52:18.000Z",
    "recipients": [
      { "id": 52, "email": "signer@example.com", "role": "SIGNER", "signingStatus": "SIGNED" }
    ]
  },
  "createdAt": "2024-04-22T11:52:18.277Z",
  "webhookEndpoint": "https://your-endpoint.com/webhook"
}
```

Top-level fields: `event`, `payload` (the document or template with its recipients),
`createdAt`, `webhookEndpoint`. In `payload`, `envelopeId` is the canonical (v2) identifier and
`id` is the legacy numeric document ID. `status` is one of `DRAFT`, `PENDING`, `COMPLETED`,
`REJECTED`, `CANCELLED`. Recipients carry `readStatus`, `signingStatus` (`NOT_SIGNED`,
`SIGNED`, `REJECTED`), `sendStatus` and `role` (`SIGNER`, `VIEWER`, `APPROVER`, `ASSISTANT`,
`CC`). Recipient `token` values are signing tokens: don't log them.

## Full Event Reference

See [Documenso's webhook events documentation](https://docs.documenso.com/docs/developers/webhooks/events).
