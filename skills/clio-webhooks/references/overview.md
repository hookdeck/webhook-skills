# Clio Webhooks Overview

## What Are Clio Webhooks?

Clio (Clio Manage) webhooks let your application detect events in a Clio account
without polling. You subscribe a webhook to a **model** (e.g. `matter`,
`contact`) and a set of **events** (e.g. `created`, `updated`, `deleted`). When
a matching event occurs on a record the authorizing user can see, Clio sends an
HTTPS `POST` to your URL describing the event.

Webhooks are created through the Clio REST API (`POST /api/v4/webhooks.json`) —
there is no dashboard UI and no official server SDK. Requests are plain REST with
an OAuth 2.0 bearer token.

## Two Request Types You Will Receive

1. **Handshake (activation)** — Right after a webhook is created, or whenever its
   URL changes, Clio POSTs your URL with an `X-Hook-Secret` header carrying a
   freshly generated shared secret. You must confirm it before the webhook is
   enabled (see [setup.md](setup.md)).
2. **Event delivery** — Signed POSTs with an `X-Hook-Signature` header (see
   [verification.md](verification.md)).

## Supported Models

Your OAuth token needs the `webhook` scope **plus** the model's own scope.

| Model | String Identifier | ID | OAuth Scope |
|-------|-------------------|:--:|-------------|
| Matter | `matter` | 1 | Matters |
| Activity | `activity` | 2 | Activities |
| Bill | `bill` | 3 | Billing |
| Calendar Entry | `calendar_entry` | 4 | Calendars |
| Communication | `communication` | 5 | Communications |
| Contact | `contact` | 6 | Contacts |
| Task | `task` | 7 | Tasks |
| Document | `document` | 8 | Documents |
| Folder | `folder` | 9 | Documents |
| Clio Payments payment | `clio_payments_payment` | 10 | Clio Payments |

## Common Event Types

The event name is delivered in the payload at `meta.event`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `created` | A record of the model is created | Sync new matters/contacts into your system |
| `updated` | A watched field changes on the model | Keep local copies in sync, trigger workflows |
| `deleted` | A record of the model is deleted | Soft-delete / archive locally |
| `matter_opened` | A matter's status becomes "Open" | Kick off intake, billing setup |
| `matter_pended` | A matter's status becomes "Pending" | Pause automations |
| `matter_closed` | A matter's status becomes "Close" | Final invoicing, close-out workflows |

Notes:

- **All** models support `created`, `updated`, `deleted`, **except**
  `clio_payments_payment`, which supports only `created` and `updated`.
- `matter_opened` / `matter_pended` / `matter_closed` are specific to the
  `matter` model.

## Specifying Fields

Payloads do **not** include the full record. When creating a webhook you pass a
`fields` string (e.g. `"id,etag,quantity,price"`) to select which fields appear
in the payload. For `updated` webhooks, `fields` also defines which fields are
"watched" — Clio only fires when at least one watched field changes.

The first update to a record after a webhook goes live always fires (even if a
watched field didn't change); subsequent updates only fire on watched-field
changes. The `fields` parameter has a 1000-character limit.

## Event Payload Structure

```json
{
  "data": {
    "id": 152,
    "etag": "\"9a103be2201ae758992733a91f02903f\""
  },
  "meta": {
    "event": "created",
    "webhook_id": 1234
  }
}
```

- `data` — the selected `fields` of the affected record (always includes `id`).
- `meta.event` — one of the event names above.
- `meta.webhook_id` — the ID of the webhook that produced the delivery.

## Delivery, Retries, and Timeouts

- Respond with `2xx`, `3xx`, or `410 Gone` to acknowledge. A `410 Gone`
  **disables** the webhook subscription.
- Any other status (or a timeout) is treated as failure and retried with
  exponential backoff. Respond quickly and defer heavy processing.

## Expiration

Webhooks **expire**: 3 days after creation by default, up to a maximum of 31
days via `expires_at`. Renew before expiry by updating `expires_at`. See
[setup.md](setup.md).

## Full Event Reference

For the complete list of models and events, see
[Clio's Webhooks documentation](https://docs.developers.clio.com/guides/clio-manage/webhooks/).
