# Proof Webhooks Overview

## What Are Proof Webhooks?

Proof (proof.com, formerly Notarize) is an online notarization and identity platform. Webhooks V2
report notary and transaction state changes to your endpoint. You create one subscription per URL
through the Webhook API and list the events you want (`"transaction.*"`, `"notary.*"`, or
individual names). Proof sends a `POST` with a JSON body for every subscribed event.

## Common Event Types

Dispatch on the body's top-level `event` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `transaction.created` | A transaction is created | Track new transactions |
| `transaction.completed` | A transaction reaches the completed state | Update order state |
| `transaction.released` | Documents are finalized and downloadable via the API | Fetch signed documents |
| `transaction.declined` | A transaction is declined | Notify the requester |
| `transaction.held_for_review` | A transaction is held for review | Flag for manual follow-up |
| `notary.created` | A new notary is created in your organization | Onboarding sync |

`transaction.released` is the reliable "documents are ready" signal. Documents may not be available
when `transaction.completed` fires, and in signer-paid workflows `released` waits for payment.

## Event Payload Structure

```json
{
  "event": "transaction.declined",
  "data": {
    "transaction_id": "ot_XXXXXX",
    "date_occurred": "2025-08-12T17:56:35Z"
  }
}
```

`data` carries IDs and `date_occurred` (ISO 8601). Some events add fields: `organization_name`,
`document` (`document_id`, `name`), `signers`, `meeting`, or `notary_id` for `notary.*` events.
Fetch full details from the Proof API.

## All Documented Event Types

Notary: `notary.compliant`, `notary.created`, `notary.needs_review`, `notary.non_compliant`,
`notary.signer_ready`.

Transaction: `transaction.created`, `transaction.deleted`, `transaction.canceled`,
`transaction.expired`, `transaction.updated`, `transaction.recalled`, `transaction.reviewed`,
`transaction.document.upload`, `transaction.document.processed`, `transaction.meeting.created`,
`transaction.meeting.failed`, `transaction.meeting.requested`,
`transaction.meeting.video.processed`, `transaction.notary.assigned`,
`transaction.sent_to_closing_ops`, `transaction.sent_to_signer`,
`transaction.sent_to_title_agency`, `transaction.signer.kba_failed`,
`transaction.signer.kba_passed`, `transaction.underwriter.not_available`,
`transaction.partially_completed`, `transaction.completed`, `transaction.released`,
`transaction.completed_with_rejections`, `transaction.signer.high_risk_detected`,
`transaction.signer.medium_risk_detected`, `transaction.held_for_review`,
`transaction.declined`, `transaction.import.processed`, `transaction.import.failed`.

The two IDV events are documented with a doubled prefix in their examples:
`transaction.transaction.automated_identity_verification_by_idv_service_failed` and
`..._passed`, under headings without it. Which form is actually sent is unknown, so match on the
suffix if you rely on them. The wildcards `*`, `transaction.*` and `notary.*` are subscription
strings, not event names.

## Delivery and Retries

- Respond `200` to acknowledge. Any other status, or no response in 30 seconds, is retried.
- Back-off retries make up to 16 attempts across 48 hours.
- Webhooks can be sent more than once and may arrive out of order. Keep your own state and skip to
  the latest status; make handlers idempotent.
- Proof can add custom headers to every request (`headers`, or the `header` string
  `"Name:value"`), e.g. an extra shared token, and a request ID header (default `X-Request-Id`).

## Full Event Reference

See [Proof's Webhooks V2 documentation](https://dev.proof.com/docs/webhooks-v2).
