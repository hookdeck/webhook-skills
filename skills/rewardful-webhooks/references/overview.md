# Rewardful Webhooks Overview

## What Are Rewardful Webhooks?

Rewardful can send webhook events to **endpoints** that notify your application any time an
event happens in your account. You add an endpoint on the dashboard's Webhooks page and choose
which event types it receives. Data is sent as JSON in a `POST` request body.

## What Events Does Rewardful Send?

31 documented types, written `<object>.<action>`. Dispatch on the body's `event.type`.

| Object | Events |
|--------|--------|
| Affiliates | `affiliate.created`, `affiliate.confirmed`, `affiliate.updated`, `affiliate.deleted` |
| Links | `affiliate_link.created`, `affiliate_link.updated`, `affiliate_link.deleted` |
| Coupons | `affiliate_coupon.created`, `affiliate_coupon.updated`, `affiliate_coupon.activated`, `affiliate_coupon.deactivated`, `affiliate_coupon.deleted` |
| Referrals | `referral.created`, `referral.lead`, `referral.converted`, `referral.deleted` |
| Sales | `sale.created`, `sale.updated`, `sale.refunded`, `sale.deleted` |
| Commissions | `commission.created`, `commission.updated`, `commission.paid`, `commission.voided`, `commission.deleted` |
| Payouts | `payout.created`, `payout.updated`, `payout.due`, `payout.paid`, `payout.deleted`, `payout.failed` |

Key events and when they fire:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `affiliate.created` | An affiliate signs up, or is created in the dashboard or API | Create a CRM contact |
| `affiliate.confirmed` | An affiliate confirms their email address | Send onboarding |
| `referral.lead` | A referral transitions to a lead | Track funnel |
| `referral.converted` | A referral becomes a paid customer | Attribute revenue |
| `sale.created` | A sale is created | Record revenue |
| `sale.refunded` | A sale is refunded | Reverse attribution |
| `commission.created` | A new commission is created | Record the liability |
| `commission.paid` | A commission is paid | Notify the affiliate |
| `payout.due` | A payout is due | Queue finance work |
| `payout.paid` | A payout is paid | Mark as settled |
| `payout.failed` | A payout fails | Alert finance |

## Event Payload Structure

```json
{
  "object": { "id": "3433fffa-8255-4843-81b1-22aebc21eb34", "email": "james@mi6.co.uk", "...": "..." },
  "event": {
    "id": "7fcdc81d-996a-4b7b-8faf-1db98b9d5507",
    "type": "affiliate.confirmed",
    "created_at": "2019-07-11T05:25:43.940Z",
    "api_version": "v1"
  },
  "request": { "id": "66a94f49-2b36-403c-83b8-91677cb1f460" }
}
```

- `object` is the record (an affiliate, sale, commission, ...), shaped like the matching REST API object.
- `event` is the event metadata: `id`, `type`, `created_at`, `api_version` (`v1`).
- No header carries the event type.

## Delivery

- Only a `200` response counts as success; any other status is a failure.
- Failures are retried with exponential backoff for 3 days, then dropped.
- Retries redeliver the same event, so dedupe on `event.id`.

## Full Event Reference

[Rewardful webhook overview](https://developers.rewardful.com/webhooks/overview) and
[event types](https://developers.rewardful.com/webhooks/event-types).
