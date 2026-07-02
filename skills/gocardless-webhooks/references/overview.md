# GoCardless Webhooks Overview

## What Are GoCardless Webhooks?

GoCardless is a bank debit and recurring payments platform (Bacs, SEPA, ACH,
Autogiro, and more). Because bank debit payments settle over hours or days rather
than instantly, **webhooks are the primary way to learn the outcome** of a payment,
mandate, payout, refund, or subscription.

GoCardless delivers webhooks as **batches**: a single POST contains a JSON body with
an `events` array (up to 250 events per request). Each event describes one change to
one resource. The request is signed with an HMAC-SHA256 signature in the
`Webhook-Signature` header.

Because GoCardless **retries the entire batch** if your endpoint returns any non-2xx
response, your handler must be **idempotent** — dedupe on each `event.id` so replays
don't double-process.

## Event Payload Structure

```json
{
  "events": [
    {
      "id": "EV123",
      "created_at": "2014-08-04T12:00:00.000Z",
      "action": "cancelled",
      "resource_type": "mandates",
      "links": {
        "mandate": "MD123",
        "organisation": "OR123"
      },
      "details": {
        "origin": "bank",
        "cause": "bank_account_disabled",
        "description": "Your customer closed their bank account.",
        "scheme": "bacs",
        "reason_code": "ADDACS-B"
      }
    }
  ]
}
```

Key fields on each event:

| Field | Description |
|-------|-------------|
| `id` | Unique event ID (e.g. `EV123`). **Use this for idempotency.** |
| `created_at` | ISO 8601 timestamp of when the event occurred |
| `resource_type` | The kind of resource: `payments`, `mandates`, `payouts`, `refunds`, `subscriptions`, etc. |
| `action` | What happened to the resource (e.g. `confirmed`, `failed`, `cancelled`) |
| `links` | IDs of related resources (e.g. `payment`, `mandate`, `payout`, `organisation`) |
| `details` | Context: `origin`, `cause`, `description`, `scheme`, `reason_code` |

You typically dispatch on the combination of `resource_type` + `action`.

## Common Event Types

### `payments`

| Action | Triggered When |
|--------|----------------|
| `created` | Payment created |
| `submitted` | Payment submitted to the banks |
| `confirmed` | Funds confirmed collected from the customer |
| `paid_out` | Payment included in a payout to your bank account |
| `failed` | Payment failed (e.g. insufficient funds) |
| `cancelled` | Payment cancelled before submission |
| `charged_back` | Customer charged the payment back |
| `chargeback_settled` | Chargeback settled |
| `late_failure_settled` | A late failure settled |
| `resubmission_requested` | Resubmission of a failed payment requested |

### `mandates`

| Action | Triggered When |
|--------|----------------|
| `created` | Mandate created |
| `submitted` | Mandate submitted to the banks |
| `active` | Mandate set up and ready to collect |
| `cancelled` | Mandate cancelled (e.g. bank account closed) |
| `failed` | Mandate setup failed |
| `expired` | Mandate expired through inactivity |
| `reinstated` | A cancelled/expired mandate reinstated |
| `transferred` | Mandate transferred to a new bank account |
| `replaced` | Mandate replaced (e.g. scheme migration) |
| `resubmission_requested` | Resubmission requested |

### `payouts`

| Action | Triggered When |
|--------|----------------|
| `paid` | Payout sent to your bank account |
| `bounced` | Payout bounced |

### `refunds`

| Action | Triggered When |
|--------|----------------|
| `created` | Refund created |
| `paid` | Refund submitted to the customer |
| `refund_settled` | Refund settled |
| `failed` | Refund failed |
| `funds_returned` | Refund funds returned |

### `subscriptions`

| Action | Triggered When |
|--------|----------------|
| `created` | Subscription created |
| `payment_created` | A payment was created for the subscription |
| `amended` | Subscription amended |
| `cancelled` | Subscription cancelled |
| `finished` | Subscription reached its end |
| `paused` | Subscription paused |
| `resumed` | Subscription resumed |

## Full Event Reference

For the complete list of resource types and actions, see GoCardless's
[webhook documentation](https://developer.gocardless.com/api-reference/#appendix-webhooks)
and [staying up to date with webhooks](https://developer.gocardless.com/getting-started/api/staying-up-to-date-with-webhooks/).
