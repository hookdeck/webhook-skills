# Chatbase Webhooks Overview

## What Are Chatbase Webhooks?

Chatbase is a platform for building AI agents (chatbots and phone agents) trained on your own content. Its webhooks send a `POST` request with a JSON body to your endpoint when something happens in a conversation: a visitor leaves their contact details, fills in a form, or finishes a phone call. Webhooks need a paid plan.

There are two separate webhook systems:

1. **Event webhooks** - per AI agent, configured on the Action or channel that produces the event. Signed with `x-chatbase-signature` (hex HMAC-SHA1 of the raw body).
2. **HIPAA conversation webhook** - one per HIPAA-compliant workspace. Delivers each conversation just before Chatbase deletes it under the HIPAA retention rules. Signed with `X-Chatbase-Signature: v1=<hex>` (HMAC-SHA256 of `timestamp.body`).

Helpdesk Triggers can also **Send webhook** to a connection created under **Settings > Webhooks > Helpdesk webhooks**. Those deliveries carry an `X-Chatbase-Signature` header and a request body you write yourself from `{{ticket.*}}` placeholders, but Chatbase does not document the signing algorithm, so this skill does not cover them.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `leads.submit` | A visitor submits their name, email, phone and any custom fields to the Collect Leads Action | Create a CRM contact, alert sales, start a nurture sequence |
| `{action name}_collect_data.submit` | A visitor completes a Collect Data Action | Store the collected fields (addresses, order numbers, booking details) |
| `{action name}_custom_form.submit` | A visitor submits a client-side custom form | Save the submission, create a ticket, start a workflow |
| `phone_call.summary` | A phone call to the AI agent ends (once per call, shortly after hang-up) | Log the call, attach the summary to the caller's record |
| `conversation.deleted` (HIPAA webhook) | A HIPAA conversation goes idle for 24 hours or reaches 7 days old and is deleted | Archive the unredacted conversation in your own system |

`{action name}` is the name you gave the Action, inserted verbatim, so a custom form Action called `Book demo` sends `Book demo_custom_form.submit`. Match these on the `_custom_form.submit` and `_collect_data.submit` suffixes.

## Event Payload Structure

Every event webhook has the same envelope:

| Key | Type | Description |
|-----|------|-------------|
| `eventType` | string | One of the event types above |
| `chatbotId` | string | The AI agent's ID |
| `payload` | object | Event-specific data |

### `leads.submit`

```json
{
  "eventType": "leads.submit",
  "chatbotId": "xxxxxxxx",
  "payload": {
    "conversationId": "xxxxxxxx",
    "customerEmail": "example@chatbase.co",
    "customerName": "Example",
    "customerPhone": "123",
    "customFields": {
      "Company name": "Acme",
      "Team size": 12,
      "utm_source": "google",
      "utm_campaign": "spring_sale"
    }
  }
}
```

`customFields` is keyed by the field names configured on the Collect Leads Action. It is only present when the Action collects custom fields or when UTM hidden fields is on and the visitor arrived with UTM parameters. Custom fields are only available in the Action's Conversational mode (Form mode allows up to three fields and no custom fields); UTM hidden fields work in both modes.

### `{action name}_collect_data.submit`

```json
{
  "conversationId": "xxxxxxxx",
  "customFields": { "City": "Paris" }
}
```

### `{action name}_custom_form.submit`

```json
{
  "conversationId": "xxxxxxxx",
  "data": { "email": "visitor@example.com" },
  "error": null
}
```

`error` is a string when an attachment upload failed.

### `phone_call.summary`

```json
{
  "conversationId": "xxxxxxxx",
  "callSummary": "Caller asked about opening hours.",
  "duration": 94,
  "callerNumber": "+14155550100",
  "calledNumber": "+14155550199"
}
```

`callSummary` can be an empty string if no summary could be generated. `duration` is in seconds. `callerNumber` may be in national format rather than E.164, depending on the carrier. `calledNumber` (E.164) tells you which line was dialled when one agent answers several numbers.

## HIPAA Conversation Webhook Payload

Headers: `X-Chatbase-Signature` (`v1=<hex>`), `X-Chatbase-Timestamp` (Unix seconds), `X-Chatbase-Delivery-Id` (UUID, also in the body as `deliveryId`).

```json
{
  "deliveryId": "b7c1e0a4-3f52-4d81-9a6c-2e4f8d0b1c73",
  "event": "conversation.deleted",
  "deletedAt": "2026-08-17T03:00:00.000Z",
  "deletionReason": "idle_24h",
  "conversation": {
    "id": "d41f8a92-6b3c-4e17-8f5a-9c0d2b7e4a16",
    "createdAt": "2026-08-16T14:02:09.000Z",
    "chatbotId": "c8e2f1b6-5a94-4d03-b7e8-1f6a3c9d0e52",
    "accountId": "a3d7c5e1-8b62-4f09-9c4d-7e2b1a8f6d30",
    "title": "Rescheduling an appointment",
    "source": "Widget or Iframe",
    "country": "US",
    "minScore": 0,
    "sentiment": "neutral",
    "userId": "patient-4821",
    "anonymousId": null,
    "leads": null,
    "lastMessageAt": "2026-08-16T14:02:15.000Z",
    "messages": []
  }
}
```

- `event` is always `conversation.deleted` today. Switch on it anyway.
- `deletionReason` is `idle_24h` or `max_age_7d`.
- `messages[].content` is a string for text messages and an **array** of `tool-call` / `tool-result` parts when an Action ran.
- `messages[].attachments[].downloadUrl` is valid for 24 hours and the file is then deleted, so fetch it while processing the delivery.
- Endpoint verification sends two probes with `"test": true` and different `deliveryId`s. Acknowledge the correctly signed one without storing it; the one signed with a throwaway key must get a non-2xx.

## Delivery, Retries and Idempotency

- **Event webhooks:** Chatbase does not document a retry policy or delivery ID for these. Deduplicate on `conversationId` plus `eventType` if duplicates would hurt.
- **HIPAA webhook:** at-least-once. Return any 2xx within **10 seconds**. Failures are retried 6 times in total over about 22 hours (15 min, 1 h, 3 h, 6 h, 12 h, each ±20%), then abandoned for good. Retries reuse the same `deliveryId`; deduplicate on it.

## Full Event Reference

- [Chatbase Webhook API Guide](https://chatbase.co/docs/developer-guides/webhooks)
- [Chatbase HIPAA Conversation Webhook](https://chatbase.co/docs/developer-guides/hipaa-webhooks)
