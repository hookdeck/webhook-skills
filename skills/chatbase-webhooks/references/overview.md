# Chatbase Webhooks Overview

## What Are Chatbase Webhooks?

Chatbase is a platform for building AI agents trained on your own content. Its Action webhooks send a `POST` request with a JSON body to your endpoint when a visitor leaves their contact details, submits a Collect Data Action or a custom form, or finishes a phone call with the agent. Webhooks need a paid plan.

This skill covers those Action webhooks, signed with `x-chatbase-signature` (hex HMAC-SHA1 of the raw body). Chatbase also has a HIPAA conversation webhook, Helpdesk webhooks and MCP Events, which are signed differently or not documented; see "Not Covered" in [SKILL.md](../SKILL.md).

## Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `leads.submit` | A visitor submits their name, email, phone and any custom fields to the Collect Leads Action | Create a CRM contact, alert sales |
| `{action name}_collect_data.submit` | A visitor submits the fields a Collect Data Action collects | Store the collected fields |
| `{action name}_custom_form.submit` | A visitor submits a custom form | Save the submission, start a workflow |
| `phone_call.summary` | A phone call to the AI agent ends (once per call, shortly after the caller hangs up) | Log the call, attach the summary to the caller's record |

`{action name}` is the name of the Action that sent the event. Match these on the `_collect_data.submit` and `_custom_form.submit` suffixes.

## Event Payload Structure

Every Action webhook has the same envelope:

| Key | Type | Description |
|-----|------|-------------|
| `eventType` | string | One of the event types above |
| `chatbotId` | string | The AI agent's ID |
| `payload` | object | Event-specific data |

### `leads.submit`

The example Chatbase's webhook guide prints (placeholder values):

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

`customFields` is keyed by the field names configured on the Collect Leads Action. It's only sent when the Action collects custom fields, which is the Action's conversational mode, and it also carries the visitor's UTM parameters when UTM hidden fields is on.

### `{action name}_collect_data.submit`

| Field | Type | Description |
|-------|------|-------------|
| `conversationId` | string | The conversation the data was collected in |
| `customFields` | object | Keyed by the field names configured on the Collect Data Action |

### `{action name}_custom_form.submit`

| Field | Type | Description |
|-------|------|-------------|
| `conversationId` | string | The conversation the form was submitted in |
| `data` | object | The submitted form fields, keyed by field name |
| `error` | string or null | Set when an attachment upload failed |

### `phone_call.summary`

| Field | Type | Description |
|-------|------|-------------|
| `conversationId` | string | The call's conversation |
| `callSummary` | string | AI-generated summary; can be an empty string if none could be generated |
| `duration` | number | Call length in seconds |
| `callerNumber` | string | The caller's number as presented by the carrier; may be in national format rather than E.164 |
| `calledNumber` | string | Your agent's number that was dialled, in E.164. Use it to tell which line was dialled when one agent answers several numbers |

Chatbase's guide documents these three payloads as field shapes only, with no example values.

## Delivery and Idempotency

Chatbase's webhook guide documents no retry policy, timeout, delivery ID or source IPs. Respond with a `2xx` quickly and do slow work afterwards. Because there's no delivery ID, make your writes idempotent, for example by upserting a lead keyed on `conversationId`.

## Full Event Reference

- [Chatbase Webhook API Guide](https://www.chatbase.co/docs/developer-guides/webhooks)
