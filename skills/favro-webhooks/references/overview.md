# Favro Webhooks Overview

## What Are Favro Webhooks?

Favro webhooks let your application react to changes on a Favro board in real
time. Each webhook is attached to a board/widget and POSTs a JSON payload to your
endpoint (`postToUrl`) whenever a subscribed change happens — a card is created,
moved, updated, or deleted, or a comment changes. Every delivery is signed so you
can confirm it genuinely came from Favro (see
[verification.md](verification.md)).

Webhooks are created either in the Favro app (the board's menu, **More** >
**Integrations and API...**) or with `POST https://favro.com/api/v1/webhooks` and
`widgetCommonId`, `name`, `postToUrl` and `secret`. When a webhook is created Favro
sends a **ping** to make sure it is configured correctly.

## Common Event Types

Every payload has a top-level `action` string. Favro reuses the same `action`
values across object types (a card and a comment can both be `created`), so the
object type is inferred from which object the payload carries: `comment`, `card`,
or `hook` (for the ping). Comment events also carry the `card` they belong to, so
check for `comment` first. Handlers in this skill dispatch on the combined
**`<type>.<action>`** key.

| Event | `action` | Object | Triggered When | Common Use Cases |
|-------|----------|--------|----------------|------------------|
| `ping` | `ping` | `hook` | Webhook created | Confirm the configuration during setup (return 200) |
| `card.created` | `created` | `card` | A card is created | Sync tasks, create mirror records |
| `card.committed` | `committed` | `card` | A card is committed to another widget | Kick off work, notify assignees |
| `card.moved` | `moved` | `card` | A card is moved on a widget | Trigger stage automations, status sync |
| `card.updated` | `updated` | `card` | Any card field except comments changes, or the card moves column | Keep external records in sync |
| `card.deleted` | `deleted` | `card` | A card is deleted | Clean up mirror records |
| `comment.created` | `created` | `comment` + `card` | A comment is added | Notifications, activity feeds |
| `comment.updated` | `updated` | `comment` + `card` | A comment is edited | Sync edited content |
| `comment.deleted` | `deleted` | `comment` + `card` | A comment is deleted | Clean up mirror records |

## Event Payload Structure

Every payload carries `payloadId` and `action`. The rest depends on the event:

- **Ping:** `hookId` and `hook` (with the webhook's `url`).
- **Card events:** `card` and `sender`. `created`, `committed` and `moved` add
  `column` and `widget`; `committed` adds `sourceWidget` and `moved` adds
  `sourceColumn`.
- **Comment events:** `card`, `comment` and `sender`.

Key fields:

- **`payloadId`** — concatenated with your webhook URL to produce the signature.
  Favro's docs don't say what it identifies, and every documented example prints
  the same value, so don't rely on it as a deduplication key.
- **`action`** — one of `ping`, `created`, `committed`, `moved`, `updated`,
  `deleted`.
- **`sender`** — the user whose action triggered the event.

### The Ping Payload

Favro's documented example:

```json
{
  "payloadId": "ZnvqwjdLh1wmbnEj6vOfHhv8ARY=",
  "action": "ping",
  "hookId": "67973f72db34592d8fc96c48",
  "hook": { "url": "https://yourserver.com/webhookfromfavro" }
}
```

## Delivery Behavior

Favro expects a `200` for each payload. If multiple payloads don't get a `200`,
Favro disables the webhook and stops sending events until it is reconfigured.
Favro doesn't document a timeout, retries or ordering. Moving a card to another
column sends both `card.moved` and `card.updated`, so make handlers idempotent:
write the card's current state keyed by `cardId` rather than applying each event
as a change. Return `200` quickly and do slow work asynchronously.

Updating a card through the Favro API also sends `card.updated`, so a handler
that writes back to the card it was notified about can loop. Favro's own example
app ([FavroRICECalculator](https://github.com/Favro/FavroRICECalculator/blob/master/index.js))
only writes when the value has changed.

## Full Event Reference

For the complete, authoritative list of events and payloads, see the
[Favro developer documentation](https://favro.com/developer/).
