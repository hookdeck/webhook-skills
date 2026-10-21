# Whop Webhooks Overview

## What Are Whop Webhooks?

Whop sends a signed `POST` with a JSON event to a public URL you register whenever something happens on your account or app: a payment succeeds, a membership activates, a refund is created. They follow the Standard Webhooks specification. Delivery is at-least-once, unordered, and retried for about 3 days.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payment.succeeded` | A payment completes | Fulfill orders, send receipts |
| `payment.failed` | A payment fails (including subscription renewals) | Dunning emails using `data.recovery_url` |
| `membership.activated` | A membership becomes active | Grant access, provision accounts |
| `membership.deactivated` | A membership ends | Revoke access |
| `refund.created` | A refund is created | Reverse fulfillment, update accounting |

`membership.deactivated` appears in the Whop SDK's event enum (`@whop/sdk`, `whop-sdk`) but is not in the events table on the docs page at time of writing; confirm it against your dashboard's event list.

Other documented events include `payment.created`, `payment.pending`, `payment.authorized`, `payment.canceled`, `payment.requires_action` (send `data.recovery_url` to the buyer for 3D Secure), `membership.updated`, `membership.trial_ending_soon`, `refund.updated`, `dispute.created`, `dispute.updated`, `invoice.paid`, `invoice.past_due`, `product.created`, `plan.updated`, `member.created`, `payout.created`, and `verification.succeeded`.

## Event Payload Structure

```json
{
  "id": "msg_bQPHmO2eBnHYtWWuxAN9K3Xd",
  "type": "payment.succeeded",
  "api_version": "v1",
  "api_version_date": "2026-08-14",
  "timestamp": "2026-08-10T17:03:24.291Z",
  "account_id": "biz_XXXXXXXX",
  "data": { "id": "pay_XXXXXXXX" }
}
```

- `id` matches the `webhook-id` header; retries reuse it.
- `account_id` replaces `company_id` for webhooks pinned at or after `api_version_date` 2026-08-14 (older or unpinned webhooks get `company_id`).
- `data` is the full resource object; `.updated` events may include `previous_attributes`.
- `api_version` `v2` and `v5` are legacy formats without Standard Webhooks signatures.

## Delivery

Respond `2xx` within 5 seconds. Retries: 30s, 2m, 8m, 30m, 1h, 3h, 6h, then every 12h (12 retries, ~71 hours). Whop disables a webhook that fails for 72 hours with 10+ failed deliveries; events during the outage are not replayed.

## Full Event Reference

See [Whop's webhook documentation](https://docs.whop.com/developer/guides/webhooks).
