# Fireflies Webhooks Overview

## What Are Fireflies Webhooks?

[Fireflies.ai](https://fireflies.ai) is an AI meeting assistant that records,
transcribes, and summarizes meetings. Fireflies uses webhooks to notify your
application when something happens to a meeting — the transcript is ready, the
summary is generated, the notetaker bot joined — so you don't have to poll the
GraphQL API for status.

Fireflies sends an HTTP POST request to your configured endpoint with the
meeting's ID. Your handler verifies the signature, then typically calls the
Fireflies GraphQL API to fetch the full transcript, summary, or action items for
that meeting.

## Webhooks V2 vs V1

Fireflies has two webhook generations. **This skill documents V2**, the current
scheme. V1 is deprecated and its Developer settings field is read-only, so new
webhooks can only be created in V2. Existing V1 webhooks keep delivering, and
the `webhook` URL on the `uploadAudio` mutation still sends the V1 payload
shape, so V1 is retained here as a legacy path.

| | V2 (current) | V1 (legacy) |
|---|---|---|
| Header value | `sha256=<hex>` | `sha256=<hex>` (per Fireflies' migration table) |
| Signature header | `X-Hub-Signature` | `X-Hub-Signature` |
| Event field | `event` | `eventType` |
| Event names | `meeting.transcribed`, `meeting.summarized`, `meeting.bot_joined` | `Transcription completed` |
| Meeting ID field | `meeting_id` | `meetingId` |
| Reference field | `client_reference_id` | `clientReferenceId` |
| Timestamp field | `timestamp` (unix ms) | not sent |
| Signing secret | optional — no header sent when unset | viewable, no longer editable |
| Event selection | subscribe per webhook | none (single event) |
| Response deadline | 2xx within 30s (connect within 10s) | not documented |

Fireflies' migration table gives both versions the same signature header and
`sha256=<hex>` format. What changes is the payload: field casing (snake_case in
V2, camelCase in V1) and the event vocabulary. The quickest way to tell which
you are receiving is the body: V2 has `event`, V1 has `eventType`. See
[verification.md](verification.md).

## Common Event Types

Fireflies delivers the event name inside the JSON body as `event` — there is
**no** event-type header. You subscribe to events per webhook when you configure
it, and only subscribed events are delivered.

| `event` value | Triggered When | Common Use Cases |
|---------------|----------------|------------------|
| `meeting.transcribed` | A meeting has been processed and the transcript is ready | Fetch transcript, sync notes to CRM, post to Slack, trigger downstream automation |
| `meeting.summarized` | The AI summary for the meeting has been generated | Pull summary and action items, create tasks, email recaps |
| `meeting.bot_joined` | The Fireflies notetaker bot joined a meeting | Mark the meeting as being recorded, notify participants, start a timer |

## Event Payload Structure

Every webhook body is a small JSON object:

```json
{
  "event": "meeting.transcribed",
  "timestamp": 1710876543210,
  "meeting_id": "ASxwZxCstx",
  "client_reference_id": "be582c46-4ac9-4565-9ba6-6ab4264496a8"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | string | yes | The event name, e.g. `meeting.transcribed`. |
| `timestamp` | number | yes | Unix timestamp in **milliseconds** when this delivery was sent. Each retry carries a new value. |
| `meeting_id` | string | yes | ID of the meeting — the same value as the transcript ID. Use it with the GraphQL API. |
| `client_reference_id` | string | no | Custom identifier you passed at upload. Absent for meetings not created via upload. |
| `reprocessed_at` | number | no | Only on a resend after the meeting's transcript or summary changed: Unix ms of that change. The same across retries of the resend. |

The webhook is intentionally minimal — it is a notification, not the transcript
itself. After verifying, query the Fireflies GraphQL API with the `meeting_id`
to retrieve the transcript sentences, summary, and metadata.

## Delivery Notes

- Requests are `POST` with a JSON body and `Content-Type: application/json`.
- Your endpoint must return a `2xx` within **30 seconds**, and the TCP
  connection must open within 10 seconds.
- Failed deliveries are retried up to 5 times, at 30 seconds, 2 minutes, 10
  minutes, 30 minutes and 2 hours. Connect failures, network errors, `429` and
  `5xx` are retried; other `4xx`, TLS errors and invalid URLs are not.
- A delivery that connects but gets no response within 30 seconds is marked
  failed and **not** retried, so a slow handler loses that event.
- Make your handler **idempotent** on `event` + `meeting_id` +
  `reprocessed_at` (absent on a first delivery). Several events share a meeting
  ID, and `timestamp` changes on every retry, so neither works alone.
- Acknowledge quickly with a `2xx` and do heavy work (API fetch, processing)
  asynchronously.
- The `X-Hub-Signature` header is sent **only when a signing secret is
  configured**. With no secret, deliveries arrive unsigned.

### Headers on a real delivery

| Header | Notes |
|--------|-------|
| `content-type` | `application/json` |
| `user-agent` | Identifies the sender, e.g. `Fireflies-Webhook/2.0` per the docs. Do not use it for routing. |
| `x-hub-signature` | Present only when a signing secret is configured. |
| `x-webhook-delivery-id` | **Observed but not documented.** A live test delivery carried one. Useful for log correlation, but it is not in the published spec and nothing says whether it repeats across retries, so do not key idempotency on it. |

## Where Webhooks Are Configured

- **Dashboard (V2):** the Webhooks V2 configuration page. Set an HTTPS URL,
  optionally add a signing secret, and select which events to subscribe to.
- **Per-upload:** pass a `webhook` URL in the `uploadAudio` GraphQL mutation to
  receive a notification for that specific upload. It still sends the **V1**
  payload shape (`meetingId`, `eventType`), independent of your V2 webhook.

See [setup.md](setup.md) for the full flow.

## Legacy: V1 Payload and Event

V1 delivers a single event with camelCase fields:

```json
{
  "meetingId": "01HXXXXXXXXXXXXXXXXXXXXXXX",
  "eventType": "Transcription completed",
  "clientReferenceId": "your-optional-upload-reference"
}
```

| `eventType` value | Triggered When |
|-------------------|----------------|
| `Transcription completed` | A meeting has been processed and the transcript is ready |

V1 has no event selection (there is only one event) and no `timestamp` field.
An existing V1 webhook's secret can be viewed under Settings → Developer
Settings → Webhook → View Configuration, but no longer changed.

## Full Event Reference

- [Fireflies Webhooks V2](https://docs.fireflies.ai/graphql-api/webhooks-v2) — current scheme
- [Fireflies Webhooks (V1)](https://docs.fireflies.ai/graphql-api/webhooks) — legacy scheme
