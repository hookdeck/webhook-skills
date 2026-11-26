# Community Webhooks Overview

## What Are Community Webhooks?

[Community](https://www.community.com) (community.com) is an SMS /
conversational-messaging platform used by brands and creators to text with their
audience. Its webhooks are HTTP `POST` requests Community sends to an HTTPS
endpoint you provide when something happens in your account — a member joins,
updates their details, leaves, or a message is sent or received.

> **Disambiguation.** This is community.com, whose developer hub is
> <https://developer.community.com>. It is not a generic "community forum"
> product, not Circle / Discourse / Bettermode, and not Salesforce Experience
> Cloud (formerly Community Cloud).

Webhooks are a plan/permission-gated feature and are configured only in the
Community Dashboard (Settings → Integrations → Webhooks). There is no API for
creating them. See [setup.md](setup.md).

## Common Event Types

Community documents six event types.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.inbound` | A member sends a message to your account | Route to a support inbox, trigger keyword automations, sentiment/analytics |
| `message.outbound` | Your account sends a message to a member | Log conversation history, attribute campaign sends, sync to a CRM |
| `member.created` | A new member joins your account | Welcome flows, CRM/ESP contact creation, audience sync |
| `member.updated` | A member unsubscribes or changes any of the standard personal data collected | Keep profile data in sync, re-segment audiences |
| `member.deleted` | A member deletes themselves | GDPR/CCPA deletion, downstream cleanup |
| `member.opted_out` | A member unsubscribes, such as by replying STOP | Suppression lists, downstream unsubscribe |

Notes on `message.outbound`: Community filters some outbound messages out of the
stream, including content handled by other Community features such as `help`,
`start`, and `stop` messages, and tapbacks, and messages with no text (media
only). Do not treat the outbound stream as a complete audit log of everything
your account sent.

Notes on `member.updated`: the docs describe member update events as firing when
a member joins, unsubscribes, deletes themselves, or changes standard personal
data — so a change in a member's lifecycle can surface across
`member.created` / `member.updated` / `member.deleted`. An opt-out triggers a
`member.updated` event *and* a `member.opted_out` event for the same member.

Notes on `member.opted_out`: the payload carries the member's current data with
`active: false`, plus an `opt_out` object with the `source` of the opt-out,
`opted_out_at`, and the `message` that triggered it (`id` and `text`).

## Event Payload Structure

Every event is a JSON object with the same envelope:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique event id — use this for deduplication |
| `type` | string | The event type, e.g. `message.inbound` |
| `object` | string | Which object is in `data` — observed values: `member`, `message` |
| `created` | string | ISO-8601 timestamp with microseconds, e.g. `2025-01-05T23:59:45.643131Z` |
| `api_version` | string | Payload version, e.g. `2024-02-12` |
| `data` | object | Event-specific data — the payload lives at `data.object` |

### Where the payload actually lives

Every one of the six documented sample payloads nests the event data under
**`data.object`**. The prose on the same documentation page instead says member
events "include a `member` object in the event's `data` field" and message
events "have a `message` object in the event's `data` field".

Follow the samples (`data.object`) since they are literal payloads, and fall
back to `data.member` / `data.message` defensively:

```javascript
const body = event.data ?? {};
const payload = body.object ?? body.member ?? body.message ?? null;
```

### Member object fields

| Field | Notes |
|-------|-------|
| `id` | Member UUID |
| `active` | Whether the member can receive campaigns and DMs |
| `timestamp` | When the member was last updated (ISO-8601) |
| `client_id` | Your Community account id |
| `communication_channel` | e.g. `"sms"` |
| `communication_channel_id` | The phone number (emptied on `member.deleted`) |
| `email`, `given_name`, `surname` | Optional personal data |
| `city`, `country`, `country_code` | Optional personal data |
| `state_or_province`, `state_or_province_abbreviation`, `postal_code` | Optional personal data |
| `date_of_birth`, `gender_identity` | Optional personal data |
| `geolocation` | Optional `{ latitude, longitude }` |

**`member.deleted` is sparse.** It carries only `id`, `active: false`,
`timestamp`, `client_id`, `communication_channel`, and an emptied
`communication_channel_id`. Handlers must not assume any personal-data field is
present on *any* member event.

```json
{
  "data": {
    "object": {
      "active": false,
      "id": "e9e98f87-ecd4-453c-9b82-5dd0c61f1cda",
      "timestamp": "2025-10-07T20:05:41.051488Z",
      "client_id": "34e13e8d-241e-52k9-87hf-143322017665",
      "communication_channel": "sms",
      "communication_channel_id": ""
    }
  },
  "id": "a2414f4e-a057-4305-946c-79a0cd6049fc",
  "type": "member.deleted",
  "object": "member",
  "created": "2025-01-16T18:00:41.909260Z",
  "api_version": "2024-02-12"
}
```

### Message object fields

| Field | Notes |
|-------|-------|
| `id` | Message UUID |
| `text` | The message text |
| `media_list` | Array of media objects (see below) |
| `outbound_message_type` | `not_set` on inbound messages; see the table below for outbound values |
| `member` | Nested member object with the current member data for the sender/recipient |

Media objects carry `id`, `url`, `filename`, `mime_type`, `width`, `height`,
`byte_size`, `thumbnail_filename`, `thumbnail_url`, and `short_url`. Several of
these are `null` or `""` in the documented samples — treat them all as optional.

#### Outbound message types

| Value | Meaning |
|-------|---------|
| `DM` | Direct message |
| `Campaign` | Campaign |
| `Fan_Onboarding` | Fan onboarding |
| `Opt_In` | Opt-in |
| `Opt_Out` | Opt-out |
| `Keyword_Response` | Keyword response |
| `Seat_Onboarding` | Seat onboarding |
| `Help_Response` | Help response |
| `Automated` | Automated |
| `External` | External |
| `External_Customer_Support` | External customer support |

The documented `message.outbound` sample shows the lowercase value
`"automated"` while the list above is capitalized, so **compare
`outbound_message_type` case-insensitively**.

### `message.inbound` sample (abridged)

```json
{
  "data": {
    "object": {
      "id": "96c8b483-c16f-4bc3-8f1b-5fe9e1001162",
      "text": "Spotify",
      "outbound_message_type": "not_set",
      "media_list": [],
      "member": {
        "active": true,
        "id": "7a3e02ec-ac2b-952a-9fc0-11b93f283de6",
        "communication_channel": "sms",
        "communication_channel_id": "12126885505",
        "given_name": "John",
        "surname": "Smith"
      }
    }
  },
  "id": "82e92c84-c1a7-4cb2-83ca-b7f13ed938d6",
  "type": "message.inbound",
  "object": "message",
  "created": "2025-01-05T21:31:19.740650Z",
  "api_version": "2024-02-12"
}
```

## Delivery Semantics

### At-least-once delivery — you must deduplicate

Community explicitly documents that a webhook can be sent more than once for the
same event. Deduplicate on the top-level event `id`, which stays the same across
retries. Store it for **at least two hours**, longer than the one-hour retry
window, record it atomically (for example with a unique constraint), and check it
before processing. Don't deduplicate on `data.object.id`: it identifies the
member or message and separate events share it.

For actions that shouldn't be repeated, such as sending a message, record the
event `id` before acting: Community's docs say it's better not to send a message
at all than to send it twice.

### Ordering

Retried events can arrive after newer ones. When updating stored member data,
compare the member's `timestamp` with the one you have and ignore older updates.

### Response requirements

| Requirement | Value |
|-------------|-------|
| Success status | `200`–`299` |
| Timeout | 15 seconds |
| Response body | Ignored |

### Retries

On a connection error, a non-2xx response, or a timeout, Community retries the
request **up to 5 times with increasing backoff**, for up to **an hour** from
when the first request was sent. Community emails you when a webhook keeps
failing, and may disable a persistently failing webhook — it then has to be
re-enabled once the situation is resolved.

Because of the 15-second budget and the retry cost, the correct handler shape
is: **verify the signature, enqueue the event, return 2xx immediately.** Do the
real work asynchronously.

## Full Event Reference

See Community's official documentation:
[Webhooks Introduction and Setup](https://developer.community.com/reference/webhooks-introduction).
The developer hub is ReadMe-hosted — append `.md` to any page URL to get the
markdown version.
