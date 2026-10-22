# Bland AI Webhooks Overview

## What Are Bland AI Webhooks?

Bland runs AI phone agents. After a call ends it POSTs a JSON record of the call (transcripts, summary, variables, metadata, price, recording URL) to a webhook URL, so you don't have to poll the call-details API. Extra webhooks can follow for citations, evals and post-transfer transcripts, and SMS conversations use the same mechanism.

This is separate from the **Webhook node** in Bland pathways (docs: [Webhooks](https://docs.bland.ai/tutorials/webhooks)), which is an *outbound* request your pathway makes to your API during a live call. That node is configured with its own URL, headers and authorization (None, Bearer or Basic) and is not signed with `X-Webhook-Signature`.

## Payload Types

Bland doesn't name the standard post-call webhook; there is no event-type field. Classify payloads by shape:

| Payload | Recognise by | Triggered When | Common Use Cases |
|---------|--------------|----------------|------------------|
| Post-call | `call_id`, `status` (e.g. `completed`), no `event_type` | A call ends. Sent to the `webhook` on the call, or the webhook on the inbound number | Store transcripts, update CRM, trigger follow-ups |
| `citations` | `event_type: "citations"` | Separate webhook after the call when `citations` is in `webhook_events` | Extracted variables linked to utterances |
| `post_transfer_transcript` | `event_type: "post_transfer_transcript"` | The call was transferred to a human and `post_transfer_transcript` is in `webhook_events` (limited rollout) | Transcript of the conversation after transfer |
| `evals` | `event_type: "evals"` | An attached evals workbench finishes a run; `evals` in `webhook_events` | Quality scores |
| `multiple` | `event_type: "multiple"` and `contents` | One payload carries more than one enrichment (`contents` can list `citations`, `corrected_transcript`, `dispositions`, `post_transfer_transcript`, `live_translation_transcript`) | Combined delivery |
| SMS message / status | `conversation_id`, `channel`, `sender` / `status` (`ended`, `timeout`, `human_handoff`, ...) | An SMS, RCS or WhatsApp message or conversation status change | SMS agents |

With citations and the dashboard "Delay post call webhook" toggle both enabled, the post-call webhook is delayed (30-60 seconds) and carries `citations` and `corrected_transcript` itself.

## Post-Call Payload Fields

Common fields (the full set is in [Post Call Webhooks](https://docs.bland.ai/tutorials/post-call-webhooks)):

| Field | Meaning |
|-------|---------|
| `call_id` / `c_id` | Unique call ID |
| `status` / `completed` / `queue_status` | Outcome of the call (docs example: `completed`, `complete`) |
| `error_message` | `null` on success; a message such as `"Call failed. The number you dialed is busy. Please try again later."` on failure |
| `call_length` | Duration in minutes |
| `to`, `from`, `inbound`, `answered_by` | Call parties and direction |
| `transcripts`, `concatenated_transcript`, `summary` | Conversation content |
| `variables`, `metadata`, `batch_id`, `pathway_id`, `pathway_logs`, `pathway_tags` | Pathway and request context; anything you put in `metadata` on the call is returned |
| `recording_url`, `price`, `disposition_tag`, `transferred_to` | Other call details |

## Streaming events (`webhook_events`)

The Send Call API's `webhook_events` array (`queue`, `call`, `latency`, `webhook`, `tool`, `dynamic_data`, `citations`, `evals`, `post_transfer_transcript`) streams log-style events to the call's webhook during the call. These carry `message`, `call_id`, `category` and `log_level` rather than the call record.

## Delivery

- `2xx` means delivered. `4xx`, `429` and `5xx` are delivery failures and trigger automatic retries; the schedule isn't documented.
- Call failures are not delivery failures: they arrive as a `200` delivery with `error_message` set.
- Dedupe on `call_id` plus `event_type`.

## Full Reference

- [Post Call Webhooks](https://docs.bland.ai/tutorials/post-call-webhooks)
- [Webhook Signing](https://docs.bland.ai/tutorials/webhook-signing)
- [Send Call API](https://docs.bland.ai/api-v1/post/calls)
