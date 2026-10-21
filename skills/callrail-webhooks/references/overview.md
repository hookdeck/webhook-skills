# CallRail Webhooks Overview

## What Are CallRail Webhooks?

CallRail (call tracking and analytics) sends an HTTP `POST` with a JSON body to URLs you register when something happens: a call arrives, finishes or is edited, a text message is sent or received, or a form is submitted. Each webhook carries a `Signature` header so you can check it came from CallRail. Webhooks are configured per company, and a company has one Webhooks integration.

CallRail does **not** include an event type in the body or in a header. The event is whichever webhook URL the request was sent to, so register a distinct URL (for example with `?callrail_event=post_call`) per type, or infer the type from the payload.

## Common Event Types

| Webhook | Integration `config` key | Triggered When | Common Use Cases |
|---------|--------------------------|----------------|------------------|
| Pre-Call | `pre_call_webhook` | An inbound call is received, before it connects | Screen-pops, CRM lookups |
| Call Routing Complete | `answered_call_webhook` | An inbound call has been routed to its destination | Live agent views |
| Post-Call | `post_call_webhook` | An inbound call ended and recording/transcription attached (max 20 min delay) | Store call records, sync to CRM |
| Call Modified | `updated_call_webhook` | A call changed after it ended (tag, note, value, transcription, summary, spam) | Refresh stored calls |
| Outbound Post-Call | `post_outbound_call_webhook` | An outbound call ended (`call_type` is `outbound`) | Outbound reporting |
| Outbound Call Modified | `updated_outbound_call_webhook` | An outbound call changed after it ended | Refresh stored calls |
| Text Message Received | `sms_received_webhook` | A tracking number received a text | Inbox routing |
| Text Message Sent | `sms_sent_webhook` | A tracking number sent a text | Message logging |
| Form Submission | `form_captured_webhook` | A tracked form was submitted (Form Tracking must be on) | Lead capture |

A Convert Assist Complete webhook (AI answers per interaction) is also documented; it has no `config` key in the integration docs, and the examples report it as `convert_assist_complete`.

## Event Payload Structure

**Call webhooks** send the call object as documented for "Retrieving a Single Call", for example `id`, `answered`, `call_type`, `direction`, `duration`, `customer_phone_number`, `tracking_phone_number`, `start_time`, `recording`, `transcription`, `tags`, `note`, `value`, and `timestamp`, plus some legacy fields. **Call Modified** adds `changes`, an array of what changed (`tags`, `note`, `value`, `transcription_text`, `call_summary`, `recording_duration`, `auto_score`, `manual_score`).

**Text message webhooks**:

```json
{
  "id": 879204976,
  "resource_id": "SCI0c14896tw1b64fb970ab62aaf4fbefd9",
  "source_number": "770-555-5555",
  "destination_number": "770-123-4567",
  "content": "CallRail is the best! ",
  "message_type": "sms",
  "media_urls": [],
  "timestamp": "2017-10-23T15:57:18.826-04:00",
  "lead_status": null,
  "conversation_id": "crpLH",
  "company_resource_id": "COM834847e9f4bb4f9h8ll29eb173fe658e",
  "person_resource_id": "PERb122rc301ec45f5yy021d4jj180c1a79"
}
```

Text Message Sent adds `agent` (the sender's name).

**Form submission** webhooks carry `id`, `company_id`, `form_data` (field name to value), `form_url`, `landing_page_url`, `referrer`, `submitted_at`, `first_form`, and source/UTM fields. There is no `timestamp` field; use `submitted_at`.

## Delivery Behavior

- Respond with a `2xx`. CallRail does not resend on failure and repeated failures can disable the integration, so acknowledge quickly and process asynchronously.
- Post-call webhooks wait for the recording, transcription and call summary, with a 20 minute timeout. Subscribe to Call Modified as well to pick up data that attaches later.
- Use `id` (calls, texts, forms) or `resource_id` (texts) to de-duplicate.

## Full Event Reference

For the complete list of webhooks and fields, see [CallRail's webhook documentation](https://apidocs.callrail.com/#webhooks).
