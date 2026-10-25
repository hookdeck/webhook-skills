# WebinarJam Webhooks Overview

## What Are WebinarJam Webhooks?

WebinarJam and EverWebinar share a **Custom Webhook** autoresponder integration. The help
center says it "sends real-time data from WebinarJam or EverWebinar to an external endpoint
(URL). When a specific action occurs, such as a user registering or attending a webinar, the
system sends registrant data to the webhook URL you define."

The 8.17.0 release notes add: "For each trigger (e.g., registration, attended live, missed
live), we send a POST request with" lead details (first name, last name, email, phone, etc.),
key links (live room, replay, unsubscribe) and optional custom body key-value pairs.

Requests are **unsigned**: no HMAC, signing secret or timestamp. The only authentication is a
Bearer token or custom header you configure (see [verification.md](verification.md)). The docs
describe no retries, ordering or delivery ID, so make handlers idempotent (for example key on
email plus trigger plus webinar).

## What Triggers Fire Webhooks?

Triggers are the conditions of the webinar's automation rules (Edit webinar > Integrations >
Custom Webhook > trigger condition). The help center names registration, attended live and
missed live; notification conditions also distinguish attended vs. did not attend and purchased
vs. did not purchase. The request carries **no documented event string**.

The examples use an `event` value that you add as a custom body key-value pair on each rule.
These values are a convention of this skill, not WebinarJam strings:

| `event` value | Trigger | Common use |
|---------------|---------|------------|
| `registered` | Registered | Add the lead to a CRM, send the live room link |
| `attended_live` | Attended live | Tag attendees, start a follow-up sequence |
| `missed_live` | Missed live | Send the replay link |
| `left_early` | Left early | Follow up with the replay |
| `purchased` | Purchase | Mark the lead as a customer |

If you would rather not add a body field, give each rule its own webhook URL path (each rule
may use a different URL) and dispatch on the path.

## Payload Structure

WebinarJam does not document field names. This payload is **illustrative only**; capture a
real delivery (for example in the Hookdeck CLI web UI) and adjust:

```json
{
  "event": "registered",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "email": "ada@example.com",
  "phone": "+15555550100",
  "live_room_link": "https://example.com/live",
  "replay_link": "https://example.com/replay",
  "unsubscribe_link": "https://example.com/unsubscribe"
}
```

## Full Event Reference

See [Connect and use a custom webhook](https://support.webinarjam.com/en/articles/15370084-connect-and-use-a-custom-webhook)
and the [8.17.0 release notes](https://support.webinarjam.com/en/articles/15370089-2026-apr-6-webinarjam-8-17-0-release-notes).
