# SignNow Webhooks Overview

## What Are SignNow Webhooks?

SignNow webhooks are called **event subscriptions** (the docs use both names).
You subscribe to one event on one entity (`POST /v2/event-subscriptions` with
`event`, `entity_id` and `attributes.callback`), and SignNow POSTs a JSON
callback to your URL when it fires. Entity types are `user`, `document` and
`document_group`. Available with an API trial, an active API subscription, or a
Site License.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `document.open` | A document was opened | Track views |
| `document.update` | A document was edited | Sync state |
| `document.complete` | All required fields on the document were filled in | Download the signed PDF, close the deal |
| `document.delete` | A document was deleted | Clean up records |
| `document.fieldinvite.create` | A field invite was created | Track pending signatures |
| `document.fieldinvite.sent` | A field invite was sent | Audit trail |
| `document.fieldinvite.signed` | A field invite was signed | Per-signer progress |
| `document.fieldinvite.decline` | A field invite was declined | Alert the sender |
| `user.document.complete` | All required fields on a user's document were filled in | Account-wide completion feed |
| `document_group.complete` | A document group was completed, or its invite expired | Group workflows |
| `document_group.invite.signer.complete` | A signer completed all documents in a group invite | Per-signer group progress |

Other documented families follow the same pattern: `user.document.*`
(`create`, `open`, `update`, `complete`, `delete`, `fieldinvite.*`,
`freeform.*`), `user.document_group.*`, `document.freeform.*`,
`document.fieldinvite.{reassign,resend,replace,delete,consent.*,authentication.failed,email.delivery.failed}`,
`template.copy`, `user.template.copy`, and `document_group.*` (`open`, `update`,
`copy`, `delete`, `invite.*`, `freeform.*`). Subscribe only to what you handle.

## Event Payload Structure

```json
{
  "meta": {
    "timestamp": 1728310375,
    "event": "user.document.open",
    "environment": "https://app.signnow.com/api",
    "callback_url": "https://example.com/webhooks/signnow",
    "access_token": "********",
    "initiator_id": "646a5e78f4154a0880a596b11c21a95866ee66e2"
  },
  "content": {
    "document_id": "3cd9758f093545089954894be9da90af210741b0",
    "document_name": "Sales Agreement",
    "user_id": "646a5e78f4154a0880a596b11c21a95866ee66e2"
  }
}
```

- `meta.event` is the event name. `content` varies by entity (`document_id`,
  `group_id`, `signer_email`, ...).
- `meta.metadata` appears only if the subscription sets `include_metadata: true`;
  it is an object, or an empty array `[]` when the entity has none.
- Handle both missing fields and unknown events: acknowledge with 200.

## Delivery and Retries

- 20-second timeout per attempt.
- 5xx: 5 retries 10 seconds apart, then 5 more 4 hours apart (`retry_count` caps 5xx retries,
  1 to 10). 5xx never unsubscribes you.
- Unreachable host: 5 retries 10 seconds apart, then up to 2 more 4 hours apart. A warning email
  comes before the last retry; if it fails, the subscription is cancelled.
- 4xx: no retries; 10+ errors in 10 minutes sends a warning email, and 30+ in 60 minutes
  unsubscribes the webhook.
- Missed events: `GET /v2/event-subscriptions/{id}/callbacks` lists deliveries.

Because deliveries repeat, make handlers idempotent.

## Full Event Reference

See [SignNow's webhook documentation](https://docs.signnow.com/docs/guides-webhooks).
