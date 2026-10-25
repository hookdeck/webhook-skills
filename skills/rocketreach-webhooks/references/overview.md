# RocketReach Webhooks Overview

## What Are RocketReach Webhooks?

RocketReach webhooks send lookup results to your server, so you don't have to poll the People
Lookup Status endpoint. They deliver async **People Lookup** and **Bulk People Lookup** results.
They are not change notifications, and there are no event types or event-type header.

You create a webhook on the **API Usage & Settings** page and reference its ID as `webhook_id` in
a lookup request. If a request has no `webhook_id`, your top-most enabled webhook is used.

## What Gets Delivered

| Request | Body |
|---------|------|
| People Lookup (`id`, `webhook_id`) | One profile object |
| Bulk People Lookup (`queries`, `webhook_id`) | A list of profile objects |

Handle both shapes: check whether the parsed JSON is an array.

## Payload Structure

```json
{
  "profile_list": { "id": 1000, "name": "Example Profile List" },
  "id": 123456,
  "status": "complete",
  "...": "the remaining People Lookup fields (name, title, employer, emails, phones, links)"
}
```

- `id` - the RocketReach profile ID you looked up
- `profile_list` - the list the profile was added to (`id`, `name`)
- `status` - per the People Lookup API: `complete`, `progress`, `searching` or `not queued`. Anything
  other than `complete` means the contact info is not fully available yet
- the other fields match the People Lookup API response; see the API reference for the full list

## Headers

| Header | Meaning |
|--------|---------|
| `X-RocketReach-Signature` | base64 HMAC-SHA256 of the raw body (only once a secret is generated) |
| `RR-Request-ID` | Correlates the delivery with your lookup request |

## Idempotency

There is no event ID. Key deduplication on `RR-Request-ID` plus the profile `id` (and `status`, if
you act on non-complete results).

## Full Reference

[RocketReach webhooks documentation](https://docs.rocketreach.co/reference/webhooks)
