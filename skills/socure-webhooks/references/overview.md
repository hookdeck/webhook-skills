# Socure RiskOS Webhooks Overview

## What Are Socure Webhooks?

Socure RiskOS pushes an HTTP `POST` with a JSON body to your HTTPS endpoint when a subscribed
event occurs: an evaluation finishes, pauses for step-up, or a case is reviewed. You choose the
URL, the use case (for example Consumer Onboarding or Account Takeover), the event types and an
auth type when you create the webhook in **Developer Workbench > Webhooks**.

Webhooks are **not signed**. RiskOS includes the configured credentials (Basic, Bearer or
OAuth 2.0) in every request; this skill covers Basic auth.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `evaluation_completed` | An evaluation finished with a final decision | Approve, review or reject an applicant |
| `evaluation_paused` | An evaluation paused waiting for async input (DocV, OTP) | Send the user to step-up, then resume |
| `reevaluation` | A case was reevaluated and finished processing | Refresh the stored decision |
| `workflow_execution_failed` | An evaluation failed to execute | Alert, retry |
| `decision_update` | A reviewer changed the decision on a case | Sync the final decision |
| `fraud_confirming` | A case was marked as fraud or non-fraud | Record fraud labels |
| `review_case_assigned` | A case was assigned to a reviewer | Notify reviewers |
| `review_case_unassigned` | A case was unassigned from a reviewer | Return to queue |
| `case_status_updated` | A case status or sub-status changed | Sync case state |
| `case_notes_added` | Notes were added to a case | Sync notes |
| `case_attachment_added` | Attachments were added to a case | Sync attachments |
| `watchlist_notification_monitored_search_updated` | A monitored entity was added to or removed from a watchlist | Ongoing monitoring review |
| `case_management_notification_case_closure` | A watchlist case was approved or closed from the Dashboard | Close matching cases |

Available event types depend on your account entitlements; not all may be visible in the Dashboard.

## Event Payload Structure

```json
{
  "event_id": "336ccd2a-b3a8-49a8-b2cc-89a4ae90feeb",
  "event_at": "2025-01-15T13:04:11.468Z",
  "event_type": "evaluation_completed",
  "data": {
    "id": "onb-12345",
    "eval_id": "6dc8f39c-ecc3-4fe0-9283-fc8e5f99e816",
    "workflow": "consumer_onboarding",
    "decision": "ACCEPT",
    "status": "CLOSED"
  }
}
```

- `event_id`: unique per delivery. Use it for idempotency; RiskOS may redeliver in rare cases.
- `event_at`: when the event occurred (ISO 8601).
- `event_type`: one of the types above.
- `data`: event-specific. For evaluation events it follows the Evaluation API response schema.

## Delivery and Retries

Your endpoint must accept `POST` with `application/json`, use HTTPS (TLS 1.2+) and return `2xx`
within 30 seconds. On failure RiskOS retries with exponential backoff (max backoff 60 seconds, up
to 10 attempts, fixed 1-minute intervals for attempts 6-10) for status codes `504`, `503`, `502`,
`429`, `423`, `409` and `408`. A `401` is not in that list.

## Full Event Reference

See Socure's [Webhook Configuration Reference](https://help.socure.com/riskos/docs/webhook-configuration-reference) and [Set up Webhooks](https://help.socure.com/riskos/docs/set-up-webhooks).
