# Aircall Webhooks Overview

## What Are Aircall Webhooks?

Aircall is a cloud call-center / business phone system. A webhook lets Aircall POST a
JSON payload to your HTTPS endpoint each time something happens on the account — a call
starts, an agent answers, a contact is updated, a transcription finishes.

A company can have up to **100 webhooks**. Each webhook subscribes to a list of events
(or to all events, if you omit the list at creation).

> Not to be confused with Airtable, Airwallex, or any other "air\*" product — this skill
> covers **aircall.io** only.

## Event Payload Structure

Every event, regardless of type, uses the same five-field envelope:

| Field | Type | Description |
|-------|------|-------------|
| `resource` | String | Name of the resource for this event |
| `event` | String | The event name, e.g. `call.answered` |
| `timestamp` | Integer | UNIX timestamp in UTC for when the payload was built |
| `token` | String | Token associated to the webhook. Identifies which Aircall account sent the event — and is what you verify against. |
| `data` | Object | Modelization of the resource at the `timestamp` value |

Aircall's docs originally documented `resource` as one of `number`, `user`, `contact`,
`call`. Published samples for newer event families also show `message`, `integration`,
`conversation_intelligence`, `ai_voice_agent`, and `analytics`.

Some guide code samples destructure only `{ event, token, data }`. That is partial
destructuring, not the wire format — `resource` and `timestamp` are always present.

### Documented sample: `number.closed`

```json
{
  "resource": "number",
  "event": "number.closed",
  "timestamp": 1585001020,
  "token": "45XXYYZZa08",
  "data": {
    "id": 456,
    "direct_link": "https://api.aircall.io/v1/numbers/123",
    "name": "My first Aircall Number",
    "digits": "+33 1 76 36 06 95",
    "country": "FR",
    "time_zone": "Europe/Paris",
    "open": false,
    "users": [
      {
        "id": 456,
        "direct_link": "https://api.aircall.io/v1/users/456",
        "name": "Madelaine Dupont",
        "email": "madelaine.dupont@aircall.io",
        "available": false,
        "language": "en-US"
      }
    ]
  }
}
```

### Documented sample: `call.created`

```json
{
  "resource": "call",
  "event": "call.created",
  "timestamp": 1732622896,
  "token": "cebcaac65XXXXXXXXXx",
  "data": {
    "id": 123,
    "direct_link": "https://api.aircall.io/v1/calls/123",
    "direction": "outbound",
    "call_uuid": "CAed058bba60a84d62c77cee898a852b05",
    "status": "initial",
    "missed_call_reason": null,
    "started_at": 1732622895,
    "answered_at": null,
    "ended_at": null,
    "duration": 0,
    "cost": "0",
    "hangup_cause": null,
    "voicemail": null,
    "recording": null,
    "raw_digits": "+1 800-123-4567",
    "participants": [
      { "phone_number": "+1 800-123-4567", "type": "external" },
      { "id": 123, "name": "John Doe", "type": "user" }
    ],
    "user": {},
    "contact": {},
    "number": {}
  }
}
```

Two naming differences between the Call **API** and Call **events**:

| Call API attribute | Call event attribute |
|--------------------|----------------------|
| `sid` | `call_uuid` |
| `conference_participants` | `participants` |

### Documented sample: `integration.deleted`

```json
{
  "event": "integration.deleted",
  "resource": "integration",
  "timestamp": 158554819,
  "token": "45XXYYZZa08",
  "data": { "integration_id": 42, "company_id": 1 }
}
```

## Complete Event Catalog

All 67 events currently published in Aircall's API reference.

### Call events (19)

| Event | Triggered When |
|-------|----------------|
| `call.created` | Inbound call hits an Aircall number, or an agent starts an outbound call |
| `call.ringing_on_agent` | The call rings on a specific agent |
| `call.agent_declined` | An agent declines the call |
| `call.answered` | An agent answers the call |
| `call.transferred` | The call is transferred to another agent |
| `call.external_transferred` | The call is transferred to an external number |
| `call.unsuccessful_transfer` | A transfer attempt fails |
| `call.hungup` | Either party hangs up |
| `call.ended` | The call has fully ended |
| `call.hold` | The call is put on hold |
| `call.unhold` | The call is taken off hold |
| `call.ivr_option_selected` | The caller selects an IVR option |
| `call.comm_assets_generated` | Recording / voicemail assets are ready |
| `call.voicemail_left` | The caller leaves a voicemail |
| `call.assigned` | The call is assigned to a user |
| `call.archived` | The call is archived |
| `call.tagged` | A tag is added to the call |
| `call.untagged` | A tag is removed from the call |
| `call.commented` | A comment is added to the call |

**Multiple call events fire for a single call.** Aircall recommends upserting on
`call.id` (`data.id`) rather than inserting per event.

For an IVR flow, link an integration to **either** the parent or the child number — not
both, which produces duplicate `call.created` events.

### User events V2 (8) — PREFERRED

| Event | Triggered When |
|-------|----------------|
| `user.created.v2` | A new user is invited to the company |
| `user.deleted.v2` | A user is deleted by an admin |
| `user.connected.v2` | A user opens Aircall Workspace |
| `user.disconnected.v2` | A user closes Aircall Workspace |
| `user.opened.v2` | A user becomes available per their working hours |
| `user.closed.v2` | A user becomes unavailable per their working hours |
| `user.wut_start.v2` | A user starts wrap-up time (WUT) |
| `user.wut_end.v2` | A user finishes wrap-up time (WUT) |

The User V2 object does **not** include the `numbers` object.

### User events V1 (8) — DEPRECATED

`user.created`, `user.deleted`, `user.connected`, `user.disconnected`, `user.opened`,
`user.closed`, `user.wut_start`, `user.wut_end`

> Aircall: "This version of User events V1 will be deprecated soon. Please migrate to
> User events V2." Use the `.v2` variants for new integrations.

Note on `user.closed` / `user.closed.v2`: if your company has substatus (unavailability
reason) enabled by Aircall support, **two** events are sent — the first with just
`availability_status`, the second with the user-selected substatus. Handle both; they are
not duplicates.

`user.wut_start` / `user.wut_end` are not sent if wrap-up time is zero and the call was
tagged *during* the call (with mandatory call tagging enabled).

### Number events (4)

| Event | Triggered When |
|-------|----------------|
| `number.created` | A number is created |
| `number.opened` | A number enters business hours |
| `number.closed` | A number leaves business hours |
| `number.deleted` | A number is deleted |

### Contact events (3)

| Event | Triggered When |
|-------|----------------|
| `contact.created` | A contact is created |
| `contact.updated` | A contact is updated |
| `contact.deleted` | A contact is deleted |

In contact webhook payloads, `created_at` and `updated_at` are UTC strings
(`YYYY-MM-DDTHH:mm:ssZ`), not integers.

### Message events (6)

| Event | Triggered When |
|-------|----------------|
| `message.sent` | A message is sent from an Aircall account |
| `message.received` | A message is received |
| `message.status_updated` | An outbound message's status changes |
| `group_message.sent` | A group message is sent to a group conversation |
| `group_message.received` | A group message is received from a group conversation |
| `group_message.status_updated` | A group message's status changes |

Messaging `data` carries a `channel` field: **`null` means SMS or MMS**; `whatsapp` means
WhatsApp. Status updates carry `data.status`.

These events only fire for numbers in **native** messaging mode. Numbers in **Proxy**
mode deliver to a configured `callbackUrl` instead and do not fire message webhooks.

Those Message Callbacks are a separate mechanism ("Callbacks are distinct from Aircall
Webhooks") with a different envelope: the event name is in **`event_name`**, not `event`,
`timestamp` is in **milliseconds**, and the only events are `message.received` and
`message.updated`. There is **no automatic retry** on failure. The body still carries a
`token` (the one returned when the number configuration was created). A handler that
reads only `event` will not recognise callback traffic, so if one endpoint receives both,
branch on which field is present.

`group_message.*` payloads include `group_conversation_id` and a `participants` array of
phone numbers.

### Conversation Intelligence events (12)

Some require the **AI Assist** add-on.

| Event | Triggered When |
|-------|----------------|
| `transcription.created` | A call transcription is ready |
| `summary.created` | A call summary is ready |
| `topics.created` | Call topics are extracted |
| `sentiment.created` | Call sentiment is computed |
| `action_item.created` | An action item is extracted |
| `playbook_result.created` | A playbook result is created |
| `playbook_result.updated` | A playbook result is updated |
| `realtime_transcription.utterances_received` | Real-time transcription utterances arrive |
| `custom_summary.result_created` | A custom summary result is created |
| `custom_summary.result_updated` | A custom summary result is updated |
| `call_evaluation.created` | A call evaluation is created |
| `call_evaluation.updated` | A call evaluation is updated |

### AI Voice Agent events (4)

| Event | Triggered When |
|-------|----------------|
| `ai_voice_agent.started` | An AI voice agent session starts |
| `ai_voice_agent.ended` | An AI voice agent session ends |
| `ai_voice_agent.escalated` | The AI voice agent escalates to a human |
| `ai_voice_agent.summary` | An AI voice agent summary is produced |

### Analytics events (2)

| Event | Triggered When |
|-------|----------------|
| `analytics.report_created` | An analytics report export is ready |
| `analytics.report_failed` | An analytics report export failed |

### Integration events (1)

| Event | Triggered When |
|-------|----------------|
| `integration.deleted` | An integration is deleted |

Only sent for webhooks created by applications using Aircall **OAuth** credentials. Useful
for syncing uninstall flows — when the integration is deleted in Aircall, delete it on
your side too.

## Delivery Guarantees

- **At least once, unordered.** Aircall: "an event will be delivered at least once, if
  generated, but events might not be delivered in a specific sequence/order." Your handler
  must be idempotent and must not depend on ordering.
- **5-second timeout.** Aircall's HTTP requests to external servers time out after 5
  seconds. Acknowledge with 200 immediately and process asynchronously.
- **Failure = non-2xx or timeout.** Aircall retries a failed event up to **50 times**.
  Aircall's own docs give three different thresholds: "retry the event up to 50 times"
  (API reference), "disables the webhook after 50 consecutive failures" (best-practices
  guide), and "after 10 failed requests" (older webhooks tutorial). Treat any sustained
  failure as a risk of deactivation rather than counting on 50.
- **Automatic deactivation.** If failures persist after all retries, the webhook is
  disabled and a notification appears on the Aircall Dashboard.
- **Automatic re-enable.** Once disabled, Aircall keeps retrying failed events for up to
  **12 hours**; a successful response in that window re-enables the webhook. Admins can
  opt into email notifications for disable/re-enable in User Settings.
- **No IP allowlist.** "The Web server must be publicly available, Aircall does not
  provide a list of static IP addresses to whitelist."
- **No replay protection.** There is no signature and no nonce; `timestamp` is unsigned.

## Filtering by Numbers

If the integration uses **OAuth**, admins can filter which numbers send call events from
the Aircall Dashboard. With **Basic Auth**, call events are sent for all numbers of a
company.

## Full Event Reference

- [Webhooks overview](https://developer.aircall.io/docs/webhooks-overview)
- [Working with call data](https://developer.aircall.io/docs/work-with-call-data)
- [API reference — Webhooks](https://developers.aircall.io/api-references)
