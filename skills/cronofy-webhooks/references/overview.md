# Cronofy Webhooks Overview

## What Are Cronofy Webhooks?

Cronofy calls them **push notifications**. Cronofy is a calendar API and scheduling
infrastructure platform: you connect a user's Google, Microsoft 365, Exchange, Apple, or
other calendar, and Cronofy normalises access to it. Push notifications tell your
application that something changed on a connected account so you don't have to poll.

Notifications are delivered to a **notification channel**. A channel is created per
account via the API (`POST {data_center_url}/v1/channels`) with a `callback_url`. There is
no dashboard-level global webhook URL — the callback URL belongs to the channel, so it can
differ per channel.

> **Cronofy is not Calendly.** Different company, different product, different signing
> scheme. Nothing in this document applies to Calendly.

## Notification Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `verification` | Immediately after a channel is created, to test that the callback URL is valid | Confirm the endpoint is live. Return 2xx — there is no token to echo, no challenge to reflect |
| `change` | One or more of the account's events changed | Fetch the delta with Read Events using `changes_since`; sync into your own database |
| `profile_disconnected` | One or more of the account's calendar profiles disconnected | Prompt the user to reauthorize; pause syncs for that profile |
| `conferencing_profile_disconnected` | One or more conferencing profiles disconnected | Prompt reconnect before creating meetings with conferencing |
| `profile_initial_sync_completed` | The initial calendar sync for a newly connected profile finished | Kick off a full read now that data is complete; flip an onboarding UI state |
| `gdpr_requested` | The account invoked their GDPR right to be forgotten | Delete the account's data on your side |

**Cronofy explicitly asks you to ignore unknown types:** "your code should be tolerant of
others, by ignoring them, so if more are introduced in future your integration will not
fail." Always include a default branch that logs and returns 2xx.

## Event Payload Structure

Every notification uses the same envelope. The discriminator is `notification.type`, a
**body field** — there is no event-type header.

```json
{
  "notification": {
    "type": "change",
    "changes_since": "2026-08-26T09:24:16Z"
  },
  "channel": {
    "channel_id": "chn_54cf7c7cb4ad4c1027000001",
    "callback_url": "{CALLBACK_URL}",
    "filters": {
      "calendar_ids": ["cal_n23kjnwrw2_sakdnawerd3"],
      "only_managed": false
    }
  }
}
```

| Field | Present On | Description |
|-------|-----------|-------------|
| `notification.type` | All | One of the six types above (or a future type you should ignore) |
| `notification.changes_since` | `change` only | ISO 8601 UTC timestamp; pass as `last_modified` to Read Events |
| `channel.channel_id` | All | The channel that produced this notification, e.g. `chn_54cf7c7cb4ad4c1027000001` |
| `channel.callback_url` | All | The URL the channel posts to |
| `channel.filters.calendar_ids` | When set on the channel | Restricts notifications to these calendars |
| `channel.filters.only_managed` | When set on the channel | Boolean — only events you manage trigger notifications |

`channel.filters` reflects non-default filters, so it may be absent or empty. Do not
depend on fields beyond the ones listed above; nothing else is documented.

A non-`change` notification carries `notification.type` plus the `channel` object:

```json
{
  "notification": { "type": "profile_disconnected" },
  "channel": {
    "channel_id": "chn_54cf7c7cb4ad4c1027000001",
    "callback_url": "{CALLBACK_URL}"
  }
}
```

## `change` Is a Ping, Not the Data

**The `change` payload does not contain the changed events.** It is a thin notification.
The flow is always: receive → verify → read.

```
GET {data_center_url}/v1/events?tzid=Etc/UTC&last_modified=2026-08-26T09:24:16Z
Authorization: Bearer {ACCESS_TOKEN}
```

`last_modified` is `notification.changes_since` verbatim. Read Events is paginated —
follow `pages.next_page` until exhausted.

Two consequences worth internalising:

1. The notification carries no calendar data, so there is nothing sensitive in the body
   itself — but the channel id identifies the account, so still verify.
2. Because you re-read from the API, duplicate notifications are cheap to absorb. That
   matters, because Cronofy has no replay protection.

Cronofy does **not** send push notifications for changes caused by your own API calls.
Don't build reconciliation logic that waits for an echo of your own write.

## Profile Disconnection Semantics

`profile_disconnected` and `conferencing_profile_disconnected` fire when Cronofy **next
tries to access** the profile and finds it broken — not at the instant the user revoked
access. There can be a delay.

Read current connection state from UserInfo rather than tracking it purely from
notifications:

- Calendar profiles: `["cronofy.data"]["profiles"]`
- Conferencing profiles: `["cronofy.data"]["conferencing_profiles"]`

`profile_initial_sync_completed` is **not sent** if the initial sync finished before the
channel existed. If you create the channel after authorization, check sync state via the
API rather than waiting for a notification that may never come.

## Delivery Behaviour

| Property | Value |
|----------|-------|
| Method | `POST` |
| Content-Type | `application/json; charset=utf-8` |
| Required response | `2xx` within **5 seconds** |
| Retry window | **24 hours** |
| On total failure | The **channel is closed automatically**; no further notifications |
| Replay protection | **None** — no timestamp, no nonce, no id in the signed content |
| Source IP allowlist | None published |

The 24-hour rule is why "ack fast, process async" is not optional here: a persistently
slow handler doesn't just lose events, it permanently kills the channel and you must
recreate it.

## Idempotency

Push notifications carry no delivery-id header and no timestamp header, so you cannot
dedupe them on provider metadata. Make the downstream Read Events sync idempotent (upsert
on event `event_uid`) instead. Don't key on `channel.channel_id` + `notification.type` or
`notification.changes_since`: types such as `profile_disconnected` can genuinely recur on a
channel and carry no `changes_since`, so those keys would drop real notifications.

Event Triggers are the exception: they send `Cronofy-Notification-ID`, which Cronofy keeps
the same across retries for deduplication, and `Cronofy-Notification-Attempt`.

## Other Cronofy Callback Surfaces

Cronofy's docs state "HMACs are generated in the same way for all callback events", so the
same verification code covers:

- **Event Triggers** — note its timeout is **7 seconds**, not 5
- **Smart Invite** callbacks
- **Meeting Agent** callback notifications

The notification types and payload envelope described here are specific to push
notifications.

## Full Event Reference

- [Push Notifications](https://docs.cronofy.com/api-reference/calendar-control/push-notifications/)
- [Push notification authentication](https://docs.cronofy.com/api-reference/authorization/webhook-authentication/)
- [Data centres](https://docs.cronofy.com/developers/temporal-grid/data-centers/)
