# Memberful Webhooks Overview

## What Are Memberful Webhooks?

Memberful (memberful.com) is a membership and subscription platform for creators. Its webhooks notify your site or app when members, subscriptions, orders, prices or downloads change, so you can create accounts elsewhere, grant or remove access, or sync data to your own database without polling. Each webhook is a `POST` with a JSON payload and an `X-Memberful-Webhook-Signature` header.

You choose which events each webhook receives in Settings → Webhooks; only matching events are sent.

## Common Event Types

Names are exact. Member events use `object_event`; most others use `object.event`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `member_signup` | A member account is created | Add the member to your app or a third-party service |
| `member_updated` | A member's profile changes (not custom fields) | Sync profile data |
| `member.deleted` | A member is deleted | Remove the member (rare; usually react to `subscription.deactivated`) |
| `tax_id.updated` | A member adds, changes or removes a tax ID | Update billing records |
| `custom_fields.updated` | A member answers or updates custom fields | Sync custom field answers |
| `subscription.created` | A subscription is added (purchase, gift activation, group join, staff-created) | Grant access |
| `subscription.updated` | A subscription changes | Detect plan changes via `changed.plan_id` |
| `subscription.renewed` | A subscription renews (also reactivations, for older integrations) | Extend access |
| `subscription.activated` | A suspended order is completed and the subscription is active again | Restore access |
| `subscription.reactivated` | A returning member reactivates a lapsed subscription (since August 2026) | Restore access, win-back automations |
| `subscription.deactivated` | A subscription fails to renew, expires, or its order is suspended | Remove access |
| `subscription.deleted` | Staff delete a subscription | Remove access |
| `order.purchased` | A member or staff places an order (not renewals) | Record purchases |
| `order.refunded` | Staff refund an order | Record refunds |
| `order.suspended` | Staff suspend an order | Pause access |
| `order.completed` | Staff complete a suspended order | Resume access |
| `subscription_plan.created` / `.updated` / `.deleted` | A price is created, updated or deleted (the name predates "price") | Sync pricing |
| `download.created` / `.updated` / `.deleted` | A download is created, updated or deleted | Sync downloads |

## Event Payload Structure

Memberful's event reference describes each event but does not show a payload or say where the event name sits. These details are documented:

- Subscription, order and price payloads include a `pass` object with `id` and `name`. The dashboard calls a `pass` a **Plan**; make access decisions from `pass`, not from price-level fields.
- `subscription.updated` carries a `changed` object mapping each field to `[old, new]` (for example `plan_id`, `expires_at`, `autorenew`). A downgrade that takes effect at the next renewal has an empty `changed`.
- Times are Unix timestamps, except subscription events, which use ISO 8601 for `activated_at`, `created_at`, `expires_at`, `trial_end_at` and `trial_start_at`.
- For `subscription.created`, compare the member ID at the top of the payload with the one nested in `member`: equal means a group manager (or a plan without groups), different means a member joining a group.
- `custom_fields.updated` values can be a string, an array of strings, or an empty array.

**Assumption:** the examples read the event name from a top-level `event` field and log anything else (with the payload's top-level keys). Confirm against a real delivery (use the test webhook in the dashboard) and adjust.

Treat every field as untrusted and check its type before use.

## Delivery

- Respond `2xx` within 15 seconds, or Memberful retries several times with exponential delay.
- After 24 hours of failed retries the account owner is notified, and the endpoint is deleted if it is still failing three days later.
- **Order is not guaranteed.** Re-fetch the member, subscription or order from Memberful's API instead of trusting the payload's state.

## Full Event Reference

See [Memberful's webhook documentation](https://memberful.com/help/custom-development-and-api/webhooks/) and the [webhook event reference](https://memberful.com/docs/api-reference/webhook-event-reference).
