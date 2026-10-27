# Sinch Conversation API Callbacks Overview

> For Sinch Conversation API callbacks. Set a secret on the Conversation API webhook and paste it here; other Sinch APIs sign callbacks differently.

## What Are Sinch Conversation API Callbacks?

Sinch's Conversation API is an omnichannel messaging API (SMS, WhatsApp, RCS, Messenger, Viber and more). You register a webhook on your app with a `target` URL, a list of `triggers` and an optional `secret`. Sinch then POSTs JSON callbacks to the URL. Sinch's SMS, Voice and Numbers callbacks are different products with different schemes and are not covered here.

## How Do I Tell Callback Types Apart?

There is **no `type` field**. Each callback has common fields plus exactly one callback-specific top-level object whose key is the type. Dispatch on which key is present.

Common fields: `project_id`, `app_id`, `accepted_time`, `event_time`, `message_metadata`, `correlation_id`.

## Common Callback Types

| Key | Triggered When | Common Use Cases |
|-----|----------------|------------------|
| `message` | A contact sends a message to your app | Inbound chat handling |
| `message_delivery_report` | Delivery status of an outbound message changes | Delivery tracking |
| `message_submit_notification` | A message is submitted to the channel | Audit trail |
| `event` | An event is received from a contact | Typing / read indicators |
| `event_delivery_report` | Delivery status of an event changes | Event tracking |
| `conversation_start_notification` | A conversation starts | Session tracking |
| `conversation_stop_notification` | A conversation stops | Session tracking |
| `contact_create_notification` | A contact is created | CRM sync |
| `contact_update_notification` | A contact is updated | CRM sync |
| `contact_delete_notification` | A contact is deleted | CRM sync |
| `contact_merge_notification` | Contacts are merged | CRM sync |
| `opt_in_notification` | A contact opts in | Consent tracking |
| `opt_out_notification` | A contact opts out | Consent tracking |
| `capability_notification` | A capability lookup completes | Channel selection |
| `batch_status_update_notification` | A batch send changes status | Bulk send tracking |
| `duplicated_contact_identities_notification` | Duplicate contact identities are found | Contact cleanup |
| `unsupported_callback` | A channel callback Sinch can't map | Debugging |

Sinch lists 19 callback types in all; the list above is the 17 with documented sample payloads, which the examples handle by name. Any other key is logged as unrecognised.

## Delivery Behaviour

- 2xx is success.
- Network errors, timeouts, 5xx and 429 (and 401/403 while fetching an OAuth2 token) are retried with exponential backoff; other 4xx are not.
- Callbacks to known test domains (webhook.site, ngrok, ...) are not retried.
- Dedup is best-effort: duplicates are possible and order is not guaranteed.

## Example Payload (`message`)

```json
{
  "app_id": "01EB37HMH1M6SV18ABNS3G135H",
  "accepted_time": "2020-11-16T08:17:44.993024Z",
  "event_time": "2020-11-16T08:17:42.814Z",
  "project_id": "c36f3d3d-1523-4edd-ae42-11995557ff61",
  "message": {
    "id": "01EQ8235TD19N21XQTH12B145D",
    "direction": "TO_APP",
    "contact_message": { "text_message": { "text": "Hi!" } },
    "channel_identity": { "channel": "MESSENGER", "identity": "2742085512340733", "app_id": "01EB37HMH1M6SV18ABNS3G135H" },
    "conversation_id": "01EQ8172WMDB8008EFT4M30481",
    "contact_id": "01EQ4174TGGY5B1VPTPGHW19R0"
  },
  "correlation_id": "correlation-id-1"
}
```

## Full Event Reference

See [Sinch's callbacks documentation](https://developers.sinch.com/docs/conversation/callbacks).
