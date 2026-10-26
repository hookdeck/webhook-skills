# Ayrshare Webhooks Overview

## What Are Ayrshare Webhooks?

Ayrshare (ayrshare.com) is a social media posting and management API. A webhook
tells you when something happens asynchronously: a scheduled post was published,
a social account was unlinked, a direct message or comment arrived, an ad changed.
Ayrshare sends an HTTP `POST` with a JSON body to your HTTPS URL.

Webhooks are registered **per action** on the Primary Profile or on a User Profile
(`POST /hook/webhook` or the Developer Dashboard). A User Profile's registered
webhook is called first; if it has none, the Primary Profile's webhook for that
action is called. The URL must be HTTPS and must not redirect.

> Register a webhook secret with Ayrshare. Without one, deliveries are unsigned and fail verification.

## Event Types (the `action` field)

Dispatch on the top-level `action`. There are 11:

| `action` | Refined by | Triggered when |
|----------|------------|----------------|
| `scheduled` | `subAction: tikTokPublished` | A scheduled post is processed (not sent for immediate posts); TikTok finishes publishing |
| `social` | `type`: `link`, `unlink`, `refresh` | A social account is linked, unlinked or must be refreshed |
| `messages` | `subAction`: `messageCreated`, `messageEdited`, `messageRead`, `reactionCreated` | A message arrives, is edited, read or reacted to |
| `batch` | `type: batch`, `batchType` | A batch export is ready (`url` expires at `urlExpires`) |
| `feed` | | A new item appears in a registered RSS feed |
| `mentions` | `subAction: mention` | Your Instagram account is mentioned |
| `comments` | `subAction: comment` | A comment is created on connected content (Facebook, Instagram, Threads) |
| `automations` | `type`: `automation.triggered`, `automation.completed` | An automation fires or finishes |
| `demo` | `type`: `upgradeWarning`, `upgrade` | Demo plan limit events |
| `suspended` | `type`: `suspend`, `unsuspend` | A profile is suspended or reinstated |
| `ads` | `type`: `created`, `spendSynced`, `accountConnected`, `accountDisconnected`, `accountRevoked` | Ad or ad account events |

Not every payload carries a `subAction` (the documented `messages` example has
none), so treat it as optional.

## Payload Fields

Common envelope fields (the exact set varies by action):

| Field | Meaning |
|-------|---------|
| `action` | The registration category |
| `hookId` | Identifies one delivery of an event; identical on every retry. Dedupe on it |
| `refId` | User Reference ID of the profile |
| `url` | Your webhook URL |
| `created` | ISO 8601 time of the event |
| `timeStamp` | Unix time, present when webhook security (a secret) is on |
| `platform` | Social network the event came from |
| `id` | Post, message or comment id (not unique alone: combine with `subAction`) |

Messages events add `message`, `senderId`, `senderDetails.name`, `conversationId`,
`recipientId`, `attachments`. Scheduled events add `status`, `errors` and `postIds`.

## Delivery Behavior

- Answer `200` within 15 seconds.
- Retried: `408`, `425`, `429`, any `5xx`, timeouts and dropped connections (9
  attempts over about an hour, then about 5 min, 30 min, 2 h and 12 h later, up
  to roughly 16 hours after the event).
- Not retried: any other `4xx`.
- At least once. Two delivery metadata headers identify each transmission:
  `X-Ayrshare-Delivery-Id` (unique per attempt) and `X-Ayrshare-Delivery-Attempt`
  (`0` on the first send). Dedupe on `hookId`, not on the delivery id, and hold
  claims for 24 hours or more.

## Full Event Reference

See Ayrshare's [webhook actions](https://www.ayrshare.com/docs/apis/webhooks/actions)
and [webhooks overview](https://www.ayrshare.com/docs/apis/webhooks/overview).
