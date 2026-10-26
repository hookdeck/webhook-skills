# Plain Webhooks Overview

## What Are Plain Webhooks?

Plain makes an HTTP POST to a public HTTPS endpoint (a *webhook target*) whenever an event you subscribed to happens in your workspace. You can create up to 25 targets per workspace. Delivery is at-least-once, so handlers must be idempotent: the top-level `id` is stable across delivery attempts. A `2xx` response is success; anything else, including redirects, is retried for about 5 days (10s, 30s, 5m, 30m, 1h, 3h, 6h, 12h, then daily).

## Common Event Types

Dispatch on `payload.eventType`, also sent in the `Plain-Event-Type` header.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `thread.thread_created` | A thread is created | Autoresponders, routing |
| `thread.email_received` | An email is received on a thread | Triage, AI replies |
| `thread.thread_status_transitioned` | Thread status changes | SLA tracking, metrics |
| `customer.customer_created` | A customer is created | CRM sync |
| `thread.thread_assignment_transitioned` | Thread assignee changes | Workload tracking |
| `thread.thread_labels_changed` | Thread labels change | Categorization |
| `thread.note_created` | A note is added | Internal alerts |
| `customer.customer_updated` | A customer changes | CRM sync |

Other families: `thread.slack_message_received`, `thread.chat_received`, `thread.email_sent`, `task.task_created`, `account.account_created`, `discussion.discussion_created`, `timeline.timeline_entry_changed`.

## Event Payload Structure

```json
{
  "id": "e_...",
  "type": "thread.thread_created",
  "timestamp": "2023-10-19T14:12:25.266Z",
  "workspaceId": "w_...",
  "payload": { "eventType": "thread.thread_created", "thread": { "id": "th_..." } },
  "webhookMetadata": {
    "webhookTargetId": "wt_...",
    "webhookTargetVersion": "...",
    "webhookDeliveryAttemptId": "...",
    "webhookDeliveryAttemptNumber": 1,
    "webhookDeliveryAttemptTimestamp": "2023-10-19T14:12:26.000Z"
  }
}
```

Headers also include `Plain-Workspace-Id`, `Plain-Webhook-Target-Id`, `Plain-Webhook-Delivery-Attempt-Number`, `Plain-Event-Type`, `Plain-Event-Id`, and `Plain-Request-Signature` when request signing is on. Payloads can contain PII.

## Full Event Reference

See [Plain's webhook documentation](https://www.plain.com/docs/webhooks) and the [event pages](https://www.plain.com/docs/webhooks/thread-created).
