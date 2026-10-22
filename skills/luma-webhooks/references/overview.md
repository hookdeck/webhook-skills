# Luma Webhooks Overview

## What Are Luma Webhooks?

Luma (lu.ma / luma.com, the events platform, not Luma AI) sends HTTPS POST requests to a URL you register for a calendar whenever subscribed activity happens: a guest registers, an event is created, a ticket is purchased. Webhooks are available to Luma Plus subscribers. Each request has a JSON body of the form `{ "type": "...", "data": { ... } }`.

Delivery: respond with a 2xx within 5 seconds. On failure Luma retries up to 3 times with exponential backoff (1, 2, then 4 minutes). A `410 Gone` response pauses the webhook automatically. Duplicates are possible, so deduplicate on the `Webhook-Id` header.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `calendar.event.added` | An event appears on your calendar (created, approved, transferred in, made public; Luma or external) | Sync a calendar listing |
| `calendar.event.submitted` | An event is submitted to your calendar and is pending approval | Approval workflows |
| `calendar.person.subscribed` | Someone follows your calendar | Grow a CRM audience |
| `calendar.person.unsubscribed` | A person opts out (unsubscribe, block, or spam report; the payload doesn't say which) | Mirror opt-outs to other email tools |
| `event.created` | A new event is created | Announce events |
| `event.updated` | Event details change, or a ticket type is added, edited, or removed (not for guest registrations) | Keep listings fresh |
| `event.canceled` | An event is canceled | Notify attendees |
| `guest.registered` | Someone registers, a host adds a guest, or a guest re-registers | Welcome email once per person |
| `guest.updated` | A registration changes (check-in, approval status, answers, tickets); also fires for new registrations | Check-in sync |
| `guest.refunded` | A host refunds a payment through Luma (including partial refunds; not for Stripe dashboard refunds) | Accounting |
| `ticket.registered` | Each individual ticket purchase (3 tickets = 3 events) | Per-ticket QR codes or badges |

Use `guest.registered` for once-per-person logic and `ticket.registered` for per-ticket logic. `calendar.person.unsubscribed` only covers opt-outs after the webhook was created.

## Event Payload Structure

```json
{
  "type": "guest.registered",
  "data": { "id": "gst-...", "user_email": "...", "approval_status": "approved", "event": { "id": "evt-...", "name": "..." } }
}
```

`data` is a guest object for `guest.*`, an event for `event.*` and `calendar.event.*`, a guest plus `event_ticket` for `ticket.registered`, and a calendar person (`id`, `email`, `user`) for `calendar.person.*`. Treat field lists as non-exhaustive.

## Full Event Reference

See [Luma webhooks help](https://help.luma.com/p/webhooks) and the [Luma API webhook types](https://docs.luma.com/reference/webhooks).
