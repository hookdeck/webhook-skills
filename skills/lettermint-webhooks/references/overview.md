# Lettermint Webhooks Overview

## What Are Lettermint Webhooks?

[Lettermint](https://lettermint.co) is a European transactional email service. A webhook makes Lettermint send an HTTP `POST` to your HTTPS endpoint whenever a selected event happens, so you don't have to poll the Team API for delivery updates. Webhooks are created in the dashboard or the Team API, scoped to a team, projects or routes, and can be protected with optional Basic Auth. Each webhook has one URL and one signing secret (`whsec_...`).

Every request is signed with the `X-Lettermint-Signature` header (`t=<unix seconds>,v1=<hex>`). It also carries `X-Lettermint-Event` (the event type), `X-Lettermint-Delivery` (delivery timestamp, Unix seconds) and `X-Lettermint-Attempt` (retry attempt number).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.created` | A message was accepted for processing | Audit trail |
| `message.sent` | The message was sent to the recipient's server | Status tracking |
| `message.delivered` | The message was successfully delivered | Update delivery status |
| `message.auto_replied` | The recipient's server sent an automatic reply (informational, doesn't change delivery status) | Ignore out-of-office replies |
| `message.hard_bounced` | Permanent delivery failure (e.g. user does not exist) | Remove the address from your lists |
| `message.soft_bounced` | Temporary delivery failure (e.g. mailbox full) | Monitor, retry logic |
| `message.spam_complaint` | A recipient reported the message as spam | Stop mailing the recipient |
| `message.failed` | Terminal processing or delivery failure | Alert, investigate `reason_code` |
| `message.suppressed` | One recipient was skipped because a suppression matched | Clean up lists |
| `message.policy_rejected` | Rejected by policy (spam score over the threshold) | Review sending rules |
| `message.unsubscribed` | The recipient unsubscribed | Update preferences |
| `message.opened` | The recipient opened the email (needs open tracking) | Engagement tracking |
| `message.clicked` | The recipient clicked a link (needs click tracking) | Engagement tracking |
| `suppression.added` | A suppression entry affecting the route was added | Sync suppressions |
| `suppression.removed` | A suppression entry was deleted | Sync suppressions |
| `message.inbound` | An inbound route received and parsed an email | Process incoming mail |
| `webhook.test` | You clicked **Test Webhook** in the dashboard | Confirm the endpoint works |

The example handlers act on `message.delivered`, `message.hard_bounced`, `message.soft_bounced`, `message.spam_complaint`, `message.failed`, `suppression.added` and `webhook.test`, and log everything else.

## Event Payload Structure

All events share one envelope:

```json
{
  "id": "54d7e8c9-1195-4ba0-9d3f-b9af92305add",
  "event": "message.delivered",
  "timestamp": "2025-08-08T20:14:00.000Z",
  "sandbox": false,
  "sandbox_result": null,
  "context": { "scope": "route", "team_id": "...", "project_id": "...", "route_id": "..." },
  "data": {}
}
```

- `id` is a UUID for the specific delivery event: use it for idempotency.
- `event` is the event type; dispatch on it.
- `sandbox` and `sandbox_result` appear on outbound message events only.
- `data` is event-specific. Message events carry `message_id`, `subject`, `recipient`, `metadata`, `tag` and `tags`; suppression events carry `suppression_id`, `type`, `value`, `reason` and `applies_to`.

## Delivery and Retries

- The request times out after 30 seconds.
- Timeouts, `408`, `429` and `5xx` responses are retried with exponential backoff: 12 attempts over about 14 hours. Other `4xx` responses (including `401`) are not retried.
- 20 consecutive deliveries with no response pause the webhook for 1 minute, doubling up to 5 minutes.

## Full Event Reference

For the complete list and payloads, see [Lettermint's webhook events documentation](https://lettermint.co/docs/platform/webhooks/events).
