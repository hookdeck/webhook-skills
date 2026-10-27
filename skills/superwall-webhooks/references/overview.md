# Superwall Webhooks Overview

## What Are Superwall Webhooks?

[Superwall](https://superwall.com) provides subscription infrastructure and paywalls for iOS, Android and
Web. Its webhooks push subscription lifecycle events (purchases, renewals, cancellations, refunds,
expirations) from the App Store, Google Play and Stripe to your server as signed HTTPS `POST`
requests. Deliveries go through Svix and follow Standard Webhooks with the `svix-*` header names.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body (snake_case fields, millisecond timestamps in V2) |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Format header | `superwall_version`: `2` for V2, `1` for legacy (dashboard-created webhooks) |
| Success | Any `2xx`; any other status or a timeout is retried with exponential backoff (no schedule documented) |
| Delivery | At least once and unordered |

## Event Payload Structure (V2)

Webhooks V2 is the current format. Every webhook created in the dashboard uses it.

```json
{
  "id": "evt_ea9c41ca861013812aa864e1807d5675",
  "api_version": "2026-09-22",
  "type": "renewal",
  "occurred_at": 1750000000000,
  "project_id": "8712",
  "app_user_id": "user_1",
  "ordering_key": "8712/user_1",
  "is_family_share": false,
  "pointer_mismatch": false,
  "event_data": { "id": "evt_abc:renewal", "name": "renewal", "store": "APP_STORE", "product_id": "com.example.pro.monthly", "period_type": "NORMAL", "price": 9.99, "proceeds": 8.49, "...": "..." },
  "subscription": { "subscription_id": "otxn_1", "state": "active", "is_active": true, "will_renew": true, "...": "..." },
  "previous": null,
  "subscriber": { "app_user_id": "user_1", "aliases": ["user_1"], "attributes": {}, "...": "..." }
}
```

- `type` is the event name, lowercase. `event_data.name` repeats the store event name.
- `id` (`evt_` + 32 hex) is stable across redelivery: **deduplicate on it.**
- Order events by `occurred_at`. To keep subscription state, keep the `subscription` snapshot with the
  highest `sequence` per `subscription_id`; still process an older event's `event_data` for accounting.
- `event_data` holds the facts of the store event (use it for revenue); `subscription` / `previous`
  give current and earlier state (use `subscription.is_active` to grant or revoke access);
  `subscriber` has aliases and user attributes.
- `app_user_id`, `subscription` and `subscriber` are `null` when Superwall doesn't know the owner. It
  holds such events up to 48 hours, then sends once; an event with no known owner never grants access.

### Legacy format

Webhooks created before V2 stay **Legacy** and keep a camelCase body:
`{ "object": "event", "type": "renewal", "projectId": 3827, "applicationId": 1, "timestamp": 1754067715103, "data": { "id": "...:renewal", "name": "renewal", "periodType": "NORMAL", "productId": "...", ... } }`.
Its event id is `data.id`. Legacy refunds are a `cancellation` with `isRefund: true`; V2 sends a separate
`refund` event. Legacy and V2 are told apart by the `superwall_version` header, not by `type`.

## Common Event Types

12 event types are documented (the list may not be exhaustive). The payload `type` is lowercase; the
uppercase names (`RENEWAL`) are only the dashboard and API subscription filter. The examples handle all 12.

| Event | Triggered When |
|-------|----------------|
| `initial_purchase` | A user starts a subscription or trial |
| `renewal` | A subscription renews, including a trial or intro offer converting to paid |
| `non_renewing_purchase` | A user makes a one-time purchase |
| `product_change` | A user switches to a different product (`event_data.new_product_id`) |
| `cancellation` | A user turns off auto-renew; the subscription stays active until it expires |
| `uncancellation` | A user turns auto-renew back on |
| `refund` | A purchase is refunded; `price` and `proceeds` are negative |
| `billing_issue` | The store can't charge the user |
| `subscription_paused` | A user pauses their subscription (Google Play only) |
| `subscription_extended` | The store extends a subscription's expiration date |
| `expiration` | A subscription expires |
| `transferred` | Reserved for ownership changes; not sent yet |

Useful `event_data` fields: `store` (`APP_STORE`, `MAC_APP_STORE`, `PLAY_STORE`, `STRIPE`, `CUSTOM`),
`environment` (`PRODUCTION` or `SANDBOX`), `period_type` (`NORMAL`, `TRIAL`, `INTRO`, `PREPAID`,
`PROMOTIONAL`), `is_trial_conversion`, `cancel_reason`, `expiration_reason`.

## Delivery Notes

- **Return `2xx` quickly**, then process asynchronously.
- A **paused** webhook does not get the events it missed while paused.
- There are **no test events** for V2: use a sandbox purchase.
- Retries and replays keep the same `id` and the original `svix-timestamp`.

## Full Event Reference

See Superwall's [Webhooks V2 reference](https://superwall.com/docs/integrations/webhooks/v2), the
[legacy webhooks page](https://superwall.com/docs/integrations/webhooks) and
[verification guide](https://superwall.com/docs/integrations/webhooks/verify).
