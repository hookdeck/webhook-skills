# CloudTalk Webhooks Overview

## What Are CloudTalk Webhooks?

CloudTalk is a cloud call center. Account-level webhooks, configured under **Settings → Webhooks** in the Dashboard, `POST` a signed JSON event to your HTTPS endpoint whenever something you subscribed to happens: a call starting, a contact changing, a transcript becoming ready. They are available on the **Essential** plan and higher, and you need the **Admin** role to manage them.

Other CloudTalk features can also call an endpoint you own: the Call Flow Designer **Webhook** step, an AI Voice Agent's **Send via Webhook** option, and Workflow Automation actions. Those are **not** covered here, are **not** signed with the Svix scheme, and do not share the retry, replay and retention behaviour described in these references.

## Event Envelope

Every delivery has the same top-level structure; every envelope field is always present.

```json
{
  "event_id": "3f9a2b4c-8d1e-8a2b-9c3d-4e5f60718293",
  "type": "contact.created",
  "version": "v1",
  "occurred_at": "2026-08-17T09:34:21.512Z",
  "company_id": "123456",
  "data": { "id": "44210", "name": "Jane Doe", "phones": ["+12025550143"] }
}
```

| Field | Description |
|-------|-------------|
| `event_id` | Unique, stable UUID. Duplicates and retries carry the same one. De-duplicate on it |
| `type` | `resource.action`, e.g. `call.started`. Route on this and ignore unknown types |
| `version` | Payload version, e.g. `v1`. New optional fields can appear within a version |
| `occurred_at` | RFC 3339 UTC. Delivery order is not guaranteed, so sort by this |
| `company_id` | Your CloudTalk account id |
| `data` | Event details, shaped per `type` and `version`. Empty values are omitted, not `null` |

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `call.started` | A call begins, before anyone picks up | Screen pops, live dashboards |
| `call.ringing` | A call rings on a specific user | Agent notifications |
| `call.answered` | A call is picked up | Start timers, mark contact as reached |
| `call.held` | A call is put on hold | Hold-time reporting |
| `call.resumed` | A call is taken off hold | Hold-time reporting (can arrive unpaired) |
| `call.ended` | A call finishes, with final details | Log calls in a CRM or helpdesk, follow-ups |
| `call.recording_ready` | A recording or voicemail is stored (async, after `call.ended`) | Fetch and archive recordings |
| `call.tags_modified` | Tags are added to or removed from a call | Sync tags to a CRM |
| `contact.created` | A contact is added | CRM sync |
| `contact.updated` | A contact changes (full current profile) | CRM sync |
| `contact.deleted` | A contact is removed (id only) | CRM sync |
| `user.created` | A user is added | Provisioning, reporting |
| `user.updated` | A user's profile changes (full current profile) | Directory sync |
| `user.deleted` | A user is removed (id only) | Deprovisioning |
| `user.status_changed` | A user's availability changes (`status`, `sub_status`, `sub_status_id`) | Workforce dashboards |
| `message.sent` | An SMS, MMS or WhatsApp message is sent from your number | Conversation logging |
| `message.received` | A message arrives on your number | Inbound routing, bots |
| `transcript.ready` | A call transcript is available | Search, QA |
| `cidata.ready` | AI analysis (summary, sentiment, topics, talk ratio, call score) is ready | Coaching, CRM notes |
| `voice_agent.extracted_data_ready` | An AI Voice Agent hands over extracted data | Lead capture |
| `dialer.disposition_created` | A user records a disposition on a Dialer call | Campaign reporting |
| `dialer.survey_filled` | A user submits a survey response on a Dialer call | Survey analytics |

## Payload Highlights

- `call.started` / `call.ringing` / `call.answered` data: `call_uuid`, `direction`, `external_number`, `internal_number` (`number_e164`, `id`, `internal_name`, ...), `group`.
- `call.held` / `call.resumed` data: `call_uuid`, `user`.
- `call.ended` data: `call_id`, `call_uuid`, `direction`, `external_number`, `internal_number`, `started_at`, `ended_at`, `talking_time`, `waiting_time`, `duration`, `recorded`, `is_voicemail`, `contacts`, `contacts_total`, `user`. Recording details arrive separately in `call.recording_ready`.
- `contact.*` data: `id`, `name`, `company`, `phones`, `emails`, `tags`, `created_at`.
- `user.status_changed` data: `user_id`, `status`, `sub_status`, `sub_status_id`. Key automation on `sub_status_id`, because admins can rename statuses.
- `message.*` data: `id`, `conversation_id`, `direction`, `channel` (`sms`, `mms`, `whatsapp`), `external_number`, `internal_number`, `body`, `media`, `contact`, `user`.

Payloads for the Conversation Intelligence, AI Voice Agent and Dialer events are documented on their own pages; only the envelope fields are relied on by the examples.

## Ordering and Delivery

Delivery is at-least-once and unordered. A `call.answered` can arrive before its `call.started`. When you need current state rather than history, fetch the resource from the REST API.

## Full Event Reference

For the complete list of events and every payload field, see [CloudTalk's webhook documentation](https://help.cloudtalk.io/guides/webhooks/overview).
