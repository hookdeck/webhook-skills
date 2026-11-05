# Facebook Messenger Webhooks Overview

## What Are Messenger Webhooks?

Messenger Platform webhooks notify your server when people interact with your Facebook Page in
Messenger: incoming messages, postbacks, reads, deliveries, reactions, opt-ins, referrals and
more. They use Meta's webhook mechanism (a GET handshake with a verify token, then POSTs signed
with `X-Hub-Signature-256`).

## Common Event Types

| Field | Key on `messaging[]` item | Description |
|-------|---------------------------|-------------|
| `messages` | `message` | A person sent the Page a message (`text`, `attachments`, `quick_reply`, `reply_to`). Meta Business Agent handoffs can carry `admin_text` and `handoff_reason` without `mid` |
| `message_echoes` | `message` (`is_echo: true`) | The Page sent a message; includes `app_id` and optional `metadata` |
| `messaging_postbacks` | `postback` | Postback button, Get Started button or persistent menu item tapped |
| `message_reads` | `read` | All Page messages sent at or before `read.watermark` were read |
| `message_deliveries` | `delivery` | Messages before `delivery.watermark` delivered; `mids` may be missing |
| `message_reactions` | `reaction` | `reaction` is `smile`, `angry`, `sad`, `wow`, `love`, `like`, `dislike` or `other`; `action` is `react`/`unreact` |
| `messaging_optins` | `optin` | Marketing Messages opt-in (`type: notification_messages`, `notification_messages_token`, `notification_messages_status`, ...) or Send to Messenger plugin (`ref`) |
| `messaging_referrals` | `referral` | Existing thread re-entered from an m.me link (`source: SHORTLINK`) or ad (`source: ADS`, `ads_context_data`) |
| `message_edits` | `message_edit` | `mid`, new `text`, `num_edit` |
| `messaging_account_linking` | `account_linking` | `status` `linked` (with `authorization_code`) or `unlinked` |
| `messaging_handovers` | `pass_thread_control`, ... | Handover protocol changes |
| `standby` | (any of the above, in `entry.standby[]`) | Events for threads your app doesn't own; postbacks there have no `payload` |

Other fields: `messaging_feedback`, `messaging_game_plays`, `messaging_policy_enforcement`,
`messenger_template_status_update`, `response_feedback`, `send_cart`. Several (`message_deliveries`,
`message_echoes`, `message_edits`, `messaging_optins`, ...) are Messenger-only; Instagram
conversations use `messaging_seen` instead of `message_reads` and get echoes inside `messages`.

## Event Payload Structure

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<PAGE_ID>",
      "time": 1458692752478,
      "messaging": [
        {
          "sender": { "id": "<PSID>" },
          "recipient": { "id": "<PAGE_ID>" },
          "timestamp": 1458692752478,
          "postback": { "title": "Get Started", "payload": "GET_STARTED" }
        }
      ]
    }
  ]
}
```

| Property | Description |
|----------|-------------|
| `object` | `page` |
| `entry[].id` | Page ID |
| `entry[].time` | Time of update (epoch **milliseconds**) |
| `entry[].messaging` | Array with the event; Meta says it holds one item, but iterate it anyway |
| `entry[].standby` | Used instead of `messaging` for handover-protocol standby events |
| `sender.id` | Page-scoped ID (PSID) of the person; the Page ID for echoes. Some plugin flows send `sender.user_ref` instead |
| `recipient.id` | Page ID; the PSID for echoes |

Multiple entries can arrive in one POST: iterate every `entry` and every item.

The `messaging_postbacks` reference page shows its sample as `{ "field": ..., "value": {...} }`
with `sender.user_ref` and a string `timestamp`; the webhooks guide and the other event pages
show the `entry[].messaging[]` form above, which is what the examples handle.

## Ordering, Retries and Disabling

- Respond `200 OK` within 5 seconds.
- Failed deliveries are retried immediately a few more times. After 15 minutes of failures an
  alert is sent; after **1 hour** you get a **Webhooks Disabled** alert and the app is
  unsubscribed from the Page, so you must subscribe again.
- After failures, messages may arrive out of order: sort by `timestamp`.
- Deduplicate on `message.mid` (or `watermark` for reads/deliveries).

## Full Event Reference

- [Meta Webhooks for Messenger Platform](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks)
- [Webhook Events Reference](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events)
