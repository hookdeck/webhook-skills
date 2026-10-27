# Origami Webhooks Overview

## What Are Origami Webhooks?

Origami is an AI sales prospecting, enrichment and outbound-sequencing platform. When a subscribed
event happens, it POSTs a signed JSON envelope to a URL you configure in
**Settings → Developers → Webhooks**, or through `POST /api/v3/account/webhooks`. Webhooks are in
beta: event types and payload shapes may still change, and Origami emails orgs with active
endpoints before any breaking change.

Events fall into three groups: v3 **Job** status changes, **table** enrichment runs, and
**sequencer** activity (messages, replies, LinkedIn connections and comments).

## Common Event Types

11 events are documented (the list may not be exhaustive). Subscribe to types or wildcards
(`job.*`, `table.*`, `sequence.*`, `sequence.connection.*`, `*`). `webhook.test` is always
delivered.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `job.succeeded` | A v3 Job finished (searches, fetches, enrichment, campaign drafts, domain purchases, mailbox provisioning, chat messages) | Fetch the result with `GET /api/v3/jobs/{job_id}` |
| `job.failed` | A Job failed; `data.error` has `code` and `message` | Alerting, retries |
| `job.cancelled` | A Job was cancelled; partial work is reported | Cleanup |
| `job.needs_input` | A Job paused for questions (`data.needs_input.questions`) or a human handoff (`data.needs_input.handoff`) | Answer via `POST /api/v3/jobs/{job_id}/input` |
| `table.run.completed` | An `enrich=true` API enrichment batch reached `complete`, `cancelled` or `failed` | Pull enriched rows |
| `sequence.message.sent` | A sequencer email or LinkedIn DM finished sending | Outreach logging |
| `sequence.reply.received` | An inbound email or LinkedIn DM matched an outbound sequence | Notify reps, update the CRM |
| `sequence.connection.requested` | A sequencer LinkedIn invite was sent | Outreach logging |
| `sequence.connection.accepted` | A LinkedIn invite from a sequence was accepted | Follow-up |
| `sequence.comment.posted` | A sequencer LinkedIn comment was published on the prospect's post (likes fire no event) | Outreach logging |
| `webhook.test` | **Test endpoint** in the dashboard, or `POST /api/v3/account/webhooks/{webhook_id}/test` | Connectivity check |

Only `sequence.reply.received` and `sequence.connection.accepted` are on by default in the
dashboard's event picker.

## Event Payload Structure

Every delivery is `POST` with a JSON body:

```json
{
  "type": "sequence.reply.received",
  "id": "01J7C5K...",
  "timestamp": "2026-10-26T12:05:00Z",
  "data": { }
}
```

- `type` is the event name.
- `id` equals the `webhook-id` header. It is stable across retries: deduplicate on it.
- `timestamp` is the **event time**, set once and replayed on retries. The `webhook-timestamp`
  header is the dispatch time and is recomputed on every attempt.
- `data` holds the event.

### Job events (`job.*`)

One `data` shape for all four: `job_id`, `operation` (for example `leads.searches.create`),
`status` (`succeeded`, `failed`, `cancelled`, `needs_input`), `sequence`, `target`, `metadata`
(echoes the object you passed when admitting the Job), `credits`, `summary` (counts and resource
ids, never row-level data), `error` (set on `job.failed`) and `needs_input`. `sequence` is a
monotonic generation: ignore any event whose `sequence` is not greater than the last one you
processed for that `job_id`.

### Table events

`table.run.completed`: `run_id`, `table_id`, `workspace_id`, `organization_id`, `source`,
terminal `status` (`complete`, `cancelled`, `failed`), `failure_reason`, `created_at`,
`completed_at`, and `counts` (`complete`, `errored`, `cancelled`). If you miss one, recover with
`GET /api/v2/tables/{tableId}/runs/{runId}`, or `GET /api/v3/jobs/{job_id}` for a v3 upsert.

### Sequencer events

Every sequencer payload carries `campaign_id` (nullable, the join key back to the campaign),
`sequence_id`, `sender.id` (the stable sender id from `GET /api/v3/account/senders`) and
`outreach_target` (`table_id`, `row_id`, `column_id`, `email`, `linkedin_urn`, `linkedin_slug`).
Branch on `data.channel` (`email` or `linkedin`).

- `sequence.message.sent`: `message` (`subject`, `body`, `provider_id`, `thread_id`, `rfc_message_id`), `message_id`, `step_index`, `sent_at`.
- `sequence.reply.received`: `reply_message`, `newly_stopped`, and optional `additional_matched_sequence_ids` when one reply matched several sequences.
- `sequence.connection.requested`: like `message.sent`, with `channel` always `linkedin`; `message.body` is the optional connection note.
- `sequence.connection.accepted`: `original_message_id`, `requested_at`, `connected_at`.
- `sequence.comment.posted`: `comment` (`body`, `comment_id`, `post_url`), `posted_at`.
- `webhook.test`: `triggered_by` (`dashboard` or `api`), `triggered_at`, `message`.

## Delivery and Retries

- **At-least-once.** One event can produce more than one POST. Deduplicate on `webhook-id`.
- **10 attempts**: immediate, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 14 h, 20 h, 24 h (±15% jitter,
  about 75 hours in total).
- `408`, `429`, `5xx` and timeouts (30 s) are retried. Other `4xx` and `3xx` responses are
  dropped, so return `200` for events you don't handle.
- `410 Gone` auto-disables the endpoint. About 100 consecutive failures also auto-disable it.
  Re-enable from the dashboard.
- **Redeliver** from the dashboard keeps the same `webhook-id`.
- No challenge or validation request is documented.

## Full Event Reference

See [Origami's webhook documentation](https://docs.origami.chat/webhooks/overview).
