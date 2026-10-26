# LoyaltyLion Webhooks Overview

## What Are LoyaltyLion Webhooks?

LoyaltyLion (loyalty and referral programs for e-commerce stores) sends an HTTP `POST` to your URL every time
a subscribed event happens, for example a customer earning points or moving into a new tier. It is more
efficient than polling the API. You subscribe per topic with the v2 Webhook API, either as an OAuth client or
with an API key. Subscriptions made by an OAuth client are only visible to that client.

Some topics have a cool-down period, noted on each topic's documentation page.

## Request Body

Webhook bodies are JSON objects:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID of this webhook event: use it to deduplicate |
| `topic` | string | The topic, e.g. `program_events/customer.enrolled` |
| `created_at` | string | ISO 8601 time the webhook was sent (may differ from when the event occurred) |
| `payload` | object | The event-specific payload |

The `x-loyaltylion-hmac-sha256` header carries the signature (see [verification.md](verification.md)).

Two shapes differ from the envelope:

- The docs' `customers/update` example has `customer` at the top level instead of under `payload`.
- `rewards/store_fulfilment` is posted to the fulfilment URL of a custom reward and has no envelope and no
  `topic`: the body is `{ test, reward_fulfilment_id, reward_id, reward_identifier, customer_id,
  customer_merchant_id, customer_email }`.

`program_events/*` payloads put their fields under `payload.properties` (for example
`payload.properties.customer`).

## Common Event Types

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `customers/update` | A customer changes in LoyaltyLion | Sync points balance and tier to a CRM or storefront |
| `program_events/customer.enrolled` | A customer joins the program | Welcome flow |
| `program_events/customer.points_earned` | A customer earns points | Record transactions, trigger messages |
| `program_events/customer.claimed_reward` | A customer claims a reward | Fulfil vouchers, notify the customer |
| `program_events/customer.tier_upgraded` | A customer moves up a tier | Unlock tier perks |
| `program_events/customer.tier_downgraded` | A customer moves down a tier | Remove tier perks |
| `program_events/customer.referral_complete` | A referral completes | Attribute referral rewards |
| `loyalty_emails/unsubscribe` | A customer unsubscribes from loyalty emails | Suppress loyalty email |
| `receipts/manual_approval_required` | A receipt needs manual review | Alert your review team |
| `rewards/store_fulfilment` | A customer claims a custom reward with a fulfilment URL | Grant the custom reward |

All 21 documented topics:

- `customers/update`, `loyalty_emails/unsubscribe`, `rewards/store_fulfilment`, `receipts/manual_approval_required`
- `program_events/customer.enrolled`, `.tier_upgraded`, `.tier_downgraded`, `.points_earned`,
  `.claimed_reward`, `.referral_complete`, `.rule_completed`, `.approaching_tier_upgrade`
- `program_events/customer.reward_available_notification`, `.recurring_reward_available_reminder`
- `program_events/customer.approaching_points_expiration`, `.approaching_reward_expiration`
- `program_events/customer.moved_to_loyal_segment`, `.moved_to_at_risk_segment`, `.moved_to_defected_segment`
- `program_events/customer.receipt_approved`, `.receipt_declined`

(`.` entries are `program_events/customer.<name>`.) The Create Webhook API also accepts three challenge topics
(`program_events/customer.challenge_milestone_reached`, `.challenge_completed`,
`.challenge_milestone_approaching`) that have no event page in the docs yet.

## Delivery and Retries

- Respond `200` within 5 seconds. A non-2xx status or no response in 5 seconds is a failed delivery.
- Failed deliveries are retried with exponential backoff until one succeeds or the subscription is removed.
- After 5 failed attempts you get an email alert (OAuth subscriptions: the address used to register the OAuth
  app; other subscriptions: the LoyaltyLion account owner). After 30 failed attempts the subscription is
  removed and you are notified again.
- Delivery is at-least-once: you can occasionally get duplicates. Deduplicate on the body's `id`.

## Full Event Reference

See [LoyaltyLion's webhook documentation](https://developers.loyaltylion.com/api-reference/v2/webhooks/overview).
