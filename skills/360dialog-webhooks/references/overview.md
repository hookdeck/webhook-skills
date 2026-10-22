# 360dialog Webhooks Overview

## What Are 360dialog Webhooks?

360dialog is a WhatsApp Business API provider. Its Cloud API sends a webhook to your server
whenever a customer messages your number, a message you sent changes status, or an operational
error occurs. A valid webhook URL is required to receive messages at all.

Webhooks carry **no signature**. The only authentication is an `Authorization: Basic` header
you configure yourself (see [verification.md](verification.md)).

## Delivery Behaviour

- A delivery succeeds when your URL returns `200 OK` within **5 seconds**. Anything else is
  retried with exponential backoff.
- The docs give two retry windows: up to 7 days (webhooks page) and "typically 24 hours, though
  this may vary" (reference page). Don't depend on either; make handlers idempotent.
- Acknowledge immediately and process asynchronously.
- Sending one message can produce several callbacks (`sent`, `delivered`, `read`); expect about
  3x outbound volume in status webhooks. Order isn't guaranteed: use `timestamp`.
- Webhooks can be set per phone number (primary, recommended) or per WABA (used when no number
  webhook exists).

## What Event Types Does 360dialog Send?

The body is `{ object: "whatsapp_business_account", entry: [{ id, changes: [{ value, field }] }] }`.
`field` names the kind of information; within `messages` the arrays tell inbound messages from
statuses.

| `field` | `value` contains | Triggered when |
|---------|------------------|----------------|
| `messages` | `messages[]` | A customer sends a message, taps a button, orders, etc. |
| `messages` | `statuses[]` | A message you sent is `sent`, `delivered`, `read`, `failed` or `played` |
| `messages` | `errors[]` | Operational or delivery issues outside normal message flow |
| `smb_message_echoes` | `message_echoes[]` | Coexistence: a message sent from the WhatsApp Business app |
| `history` | `history[]` | Coexistence: chat history sharing approved or declined, then history chunks |
| `smb_app_state_sync` | `state_sync[]` | Coexistence: contacts added or changed in the Business app |

### Inbound message types (`messages[].type`)

`text`, `reaction`, `image`, `video`, `audio`, `document`, `sticker`, `location`, `contacts`,
`interactive` (quick reply, list and reply button answers), `button`, `order`, `system` (user
changed number), `unsupported`/`unknown` (carries `errors`), plus Click to WhatsApp ad referrals,
Flow completions and product inquiries. Media messages carry a media ID; fetch the file with the
media endpoints.

### Status values (`statuses[].status`)

| Status | Meaning |
|--------|---------|
| `sent` | Sent from Meta's servers (one checkmark) |
| `delivered` | Delivered to the user's device (two checkmarks) |
| `read` | Displayed in an open chat (two blue checkmarks) |
| `failed` | Could not be sent or delivered (see `errors`) |
| `played` | A voice message was played for the first time |

## Payload Examples

Inbound text:

```json
{ "object": "whatsapp_business_account",
  "entry": [{ "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "changes": [{ "field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": { "display_phone_number": "15550783881", "phone_number_id": "106540352242922" },
      "contacts": [{ "profile": { "name": "NAME" }, "wa_id": "16315551234" }],
      "messages": [{ "from": "16315551234", "id": "wamid.ID", "timestamp": "1504902988",
                     "text": { "body": "MESSAGE_BODY" }, "type": "text" }] } }] }] }
```

Status update (`value.statuses`): `{ "id": "wamid.ID", "status": "delivered", "timestamp": "...",
"recipient_id": "16315551234" }`, plus `conversation` and `pricing` on some statuses.

## Coexistence Event Envelope

The docs show `history` and `smb_app_state_sync` as `{ "id": "...", "event": "history", "data": { ... } }`
(partner-configured webhook), while `smb_message_echoes` uses the standard `entry[].changes[]`
format with `field: "smb_message_echoes"`. The examples handle both. 360dialog direct clients
don't use the partner webhook for history and download it from the 360dialog Hub instead.

## Full Reference

- Webhooks: https://docs.360dialog.com/docs/messaging/webhook
- Webhook Reference (all payloads): https://docs.360dialog.com/docs/messaging/webhook/webhook-reference
