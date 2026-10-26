# camelAI Webhooks Overview

## What Are camelAI Webhooks?

[camelAI](https://camelai.com) is a platform whose hosted agent runtime is **camelRun**. camelRun webhooks push events about agent runs, human input requests, usage, voice sessions, billing and end-user credits to an HTTPS endpoint you register. Deliveries are signed per [Standard Webhooks](https://www.standardwebhooks.com/). (This is unrelated to CAMEL-AI.org, the open-source multi-agent framework.)

## Common Event Types

The docs list 20 event types and note the list may not be exhaustive.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `run.started` | An agent run begins | Track run lifecycle |
| `run.completed` | A run finishes successfully | Collect results, notify users |
| `run.failed` | A run fails | Alerting, retries |
| `input.requested` | A run asks for input | Route a question to a person |
| `input.resolved` | A requested input is answered | Resume or audit a run |
| `usage.recorded` | Usage is recorded | Metering and cost tracking |
| `voice.session.started` | A voice session starts | Open a call record |
| `voice.session.ended` | A voice session ends | Close a call record |
| `voice.session.error` | A voice session errors | Alerting |
| `voice.utterance` | An utterance is produced | Live transcripts |
| `voice.speech.started` | Speech starts | Turn-taking, barge-in |
| `voice.speech.ended` | Speech ends | Turn-taking |
| `billing.balance.low` | The account balance is low | Top-up reminders |
| `billing.balance.depleted` | The account balance is used up | Pause workloads |
| `end_user.balance.low` | An end user's balance is low | Prompt the end user to top up |
| `end_user.credit.exhausted` | An end user's credit runs out | Block or upsell |
| `end_user.credit.granted` | Credit is granted to an end user | Ledger sync |
| `end_user.credit.refunded` | Credit is refunded to an end user | Ledger sync |
| `end_user.credit.adjusted` | An end user's credit is adjusted | Ledger sync |
| `end_user.allowance.low` | An end user's allowance is low | Warn the end user |

## Event Payload Structure

Every event is a JSON envelope:

```json
{
  "id": "evt_...",
  "type": "run.completed",
  "created": 1767225600,
  "data": { }
}
```

- `id` (`evt_...`) is also the `webhook-id` header and stays the same across retries.
- `type` is one of the event types above.
- `created` is Unix seconds.
- `data` holds the event-specific fields. See the docs for each event's shape.

The deprecated usage webhook (`PUT /v1/usage-webhook`) is not an envelope and carries no `type`.

## Delivery Behavior

- At least once. Respond with a `2xx` within 10 seconds.
- Anything else is retried with exponential backoff, from 5 seconds to an hour apart, for 3 days.
- Retries can reorder events. Order by `created` and dedupe by `id`.
- An endpoint receives runs that begin after the endpoint is created.

## Full Event Reference

For the complete list of events and payloads, see [camelAI's webhook documentation](https://camelai.com/docs/camelrun/webhooks).
