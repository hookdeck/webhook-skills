# Laso Finance Webhooks Overview

## What Are Laso Finance Webhooks?

[Laso Finance](https://laso.finance) provides banking, cards and payouts for AI agents. Everything that notifies the account owner (banking application status changes, bank transfer and payout completions, agent wallet deposits, card orders, withdrawals) can also be delivered to your agent as a signed HTTP POST. You register one URL per account with `POST /register-webhook`, and every notification is POSTed to it in addition to the owner's own channels (push, SMS, Telegram, in-app).

This replaces polling `listBankingTransactions` or `/get-withdrawal-status` on a timer. Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with the account's `whsec_` secret. If your agent runtime cannot receive inbound HTTP, the docs suggest pointing the URL at whatever your harness provides for external events (a gateway endpoint, a relay or a queue you drain), or continuing to poll.

## Event Payload Structure

```json
{
  "type": "notification.transaction",
  "timestamp": "2026-07-31T18:04:05.000Z",
  "data": {
    "user_id": "usr_abc123",
    "title": "Bank transfer complete",
    "text": "$250.00 landed in your agent wallet.",
    "category": "transaction"
  }
}
```

| Field | Meaning |
|-------|---------|
| `type` | The event type: `notification.` plus the category. This is what handlers switch on |
| `timestamp` | ISO 8601 time of the notification |
| `data.user_id` | The account owner |
| `data.title` | Notification title, as shown to the owner |
| `data.text` | Notification text, as shown to the owner |
| `data.category` | The bare category, repeating the suffix of `type` |

There is no event id in the body. The `webhook-id` header (`msg_...`) identifies the message and is the idempotency key. The `data` fields are human-readable notification text, so look up the underlying object through the status endpoints rather than parsing `text`.

## Common Event Types

| Event | Triggered When |
|-------|----------------|
| `notification.account` | Banking application or account status changes. Also the test delivery sent when you register |
| `notification.transaction` | A bank transfer or payout completes |
| `notification.deposit` | A deposit lands in the agent wallet |
| `notification.withdrawal` | A withdrawal changes state |
| `notification.card` | A card order is updated |
| `notification.giftCard` | A gift card order is updated |
| `notification.refund` | Named in the docs, not described |
| `notification.balanceUpdate` | Named in the docs, not described |

The docs say "Categories include" these eight, so the list may grow. The one example the docs show is `notification.transaction`; the other descriptions are inferred from the category names and the notification types the docs list. Ignore types you don't recognise and return `200`.

## Delivery Behaviour

- Plain `POST` with a JSON body to a public HTTPS URL.
- **10-second timeout, no retries.** A failed delivery is not sent again; reconcile against the status endpoints.
- After **50 consecutive failures** the registration is disabled. `GET /get-webhook` shows `disabled`, `consecutive_failures` and the status, timestamp and detail of the last attempt. Registering again re-enables it.
- One webhook per account, receiving every notification. There is no per-type selection.

## Full Reference

See [Laso Finance's webhook guide](https://docs.laso.finance/guides/agent-webhooks).
