# Plunk Webhooks Overview

## What Are Plunk Webhooks?

[Plunk](https://www.useplunk.com) is an email platform. It sends webhooks through its
**workflow** system: an event happens in Plunk (an email bounces, a contact unsubscribes, a
custom event is tracked), a workflow triggered by that event runs, and the workflow's
**Webhook** step sends an HTTP request to your URL.

Things that differ from provider webhooks such as Stripe or GitHub:

- **No signature.** Requests are unsigned. You add a secret header to the step and check it.
  See [verification.md](verification.md).
- **No event field on the wire.** The trigger event only selects the workflow. The body does not
  say `email.bounce`. Use one workflow (and ideally one header secret or URL) per event type you
  care about, or infer the kind from the fields of `event`.
- **The method is yours.** A literal verb: `GET`, `POST`, `PUT`, `PATCH` or `DELETE`. Default `POST`.
- **No automatic retries.** A non-2xx response or a 10 second timeout fails the workflow step.
- **Public URL only.** Private and loopback addresses are blocked, and only `http://` and
  `https://` are accepted (prefer HTTPS). Up to 5 redirects are followed.

## Trigger Events

| Trigger | Fires When | Common Use Cases |
|---------|------------|------------------|
| `email.sent` | An email was successfully sent | Store the provider `messageId` |
| `email.delivery` | An email was delivered | Delivery receipts |
| `email.open` | A contact opened an email | Engagement tracking |
| `email.click` | A contact clicked a link | Click tracking |
| `email.bounce` | An email bounced (hard or soft) | Keep your contact status in sync |
| `email.complaint` | A contact marked an email as spam | Suppress the contact |
| `email.received` | An email arrived at your verified domain | Inbound email handling |
| `contact.subscribed` | Subscription status changed to subscribed | Sync opt-ins |
| `contact.unsubscribed` | Subscription status changed to unsubscribed | Sync opt-outs |
| `segment.<name>.entry` | A contact entered a segment | Audience sync |
| `segment.<name>.exit` | A contact left a segment | Audience sync |

Segment names are slugified, for example `segment.vip-users.entry`. Custom events you track via
the API (such as `user.signup`) can trigger workflows too.

## Default Body

With no custom body on the step, Plunk sends JSON:

```json
{
  "contact": { "email": "user@example.com", "subscribed": true, "data": { "name": "John", "plan": "pro" } },
  "workflow": { "id": "wf_abc123", "name": "Bounce Notifications" },
  "execution": { "id": "exec_xyz789", "startedAt": "2025-01-15T10:30:00.000Z" },
  "event": {
    "subject": "Welcome to Plunk",
    "from": "hello@example.com",
    "emailId": "ac32f08e-c6b9-45d3-9824-a73dff1e3bbf",
    "sourceType": "CAMPAIGN",
    "bounceType": "Permanent",
    "bouncedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

`event` holds the data of the trigger event and depends on its type:

| Trigger | Extra `event` fields |
|---------|----------------------|
| `email.sent` | `sentAt` |
| `email.delivery` | `deliveredAt` |
| `email.open` | `openedAt`, `opens`, `isFirstOpen` |
| `email.click` | `link`, `clickedAt`, `clicks`, `isFirstClick` |
| `email.bounce` | `bounceType`, `bouncedAt`, `transientBounce` |
| `email.complaint` | `complainedAt` |
| `email.received` | `from`, `to`, `subject`, `recipients`, `spfVerdict`, ... |
| `contact.*` | `{}` (or `reason` when a bounce or complaint caused the unsubscribe) |
| `segment.*` | `segmentId`, `segmentName` |
| custom events | whatever you passed in `data` when tracking |

Email events also carry `subject`, `from`, `fromName`, `messageId`, `emailId`, `templateId`,
`campaignId` and `sourceType`. `emailId` matches the id returned by `POST /v1/send`.

## Custom Bodies

A custom body **replaces** the default entirely and is JSON-encoded. The handler can then only
rely on what you put in it, so treat it as plain JSON. Header values, URL and body support
`{{variable}}` interpolation (`{{email}}`, `{{event.subject}}`, ...).

## Full Event Reference

See [Plunk's webhook documentation](https://docs.useplunk.com/guides/webhooks).
