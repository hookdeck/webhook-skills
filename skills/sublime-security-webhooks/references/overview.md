# Sublime Security Webhooks Overview

## What Are Sublime Security Webhooks?

Sublime Security is an email security platform. A **webhook Action** sends an HTTP POST with a JSON body to your URL when the Action runs: when a detection rule flags a message, when a group of messages triggers it, or when someone sends a message to it manually. Use it to push flagged-email alerts into a SIEM, ticketing system, chat tool, or your own service.

Each webhook Action has its own signing secret. Every delivery is signed in `X-Sublime-Signature` (see [verification.md](verification.md)).

## Common Event Types

The `type` field in the body says why the delivery was sent.

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `message.flagged` | A message matched a detection rule and the webhook Action fired | Alerting, SIEM ingestion, open a ticket |
| `group` | The Action fired for a message group | Campaign-level alerting |
| `manual` | A user sent a message to the webhook Action by hand | Analyst-driven escalation |

`type_extended` may list several reasons at once, and adds `group_late_arriving`. Dispatch on `type`, and treat unknown values as acknowledged-but-unhandled so new types don't cause retries.

## Event Payload Structure

```json
{
  "id": "5e02026c-55c1-4cbb-8a18-76eb2f3e06d3",
  "api_version": "0",
  "created_at": "2021-06-30T16:17:22.937642Z",
  "type": "message.flagged",
  "data": {
    "message": {
      "id": "dff3be1d-b348-4dab-bb60-582842909a88",
      "canonical_id": "767f6519458092af9994a79ae73ca055e1365618",
      "external_id": "17a5db5ea7fa760d",
      "message_source_id": "a5843e7d-4ba5-40df-954e-73cb2f1e3e7e",
      "mailbox": { "id": "f0654b68-...", "external_id": "109412126579921477721" }
    },
    "classification": "malicious",
    "flagged_rules": [
      { "id": "756b841c-...", "name": "Brand impersonation: Internal Revenue Service", "severity": "high", "tags": ["brand-impersonation", "suspicious-sender"] }
    ],
    "triggered_actions": [
      { "id": "6f45c807-...", "name": "Auto-trash", "type": "trash_message" }
    ]
  }
}
```

- `id` is unique per delivery; use it to drop duplicates.
- `data.message` identifies the email and mailbox; `data.flagged_rules` lists the rules that matched; `data.triggered_actions` lists the Actions that ran.

## Delivery

Your endpoint should return a `2xx` within **10 seconds**. Sublime's own retries come with a new timestamp and signature; Hookdeck retries and replays resend the original request unchanged. Either way, make handlers idempotent on the body `id`.

## Full Event Reference

For the complete payload description, see [Sublime's webhook documentation](https://docs.sublime.security/docs/webhooks).
