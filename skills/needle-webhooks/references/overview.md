# Needle Webhooks Overview

## What Are Needle Webhooks?

[Needle](https://needle.app) (formerly needle-ai.com) is an agent-native outbound and GTM engine. A webhook sends every event the creating member can see to your HTTPS URL as it happens: one `POST` per event with a JSON body. Each request is signed with [Standard Webhooks](https://www.standardwebhooks.com/) headers. A workspace can have up to 5 webhooks.

## Common Event Types

The docs list 67 types. Your receiver should switch on the top-level `type` and ignore ones it doesn't know, because Needle adds types over time.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `lead_created` | A lead is created from the app, API, MCP, an import or a direct message | Sync new leads to a CRM |
| `lead_updated` | A lead's details or handles change (`data.data.changes`) | Keep your records current |
| `linkedin_message_received` | A LinkedIn reply arrives | Route replies to sales, stop follow-ups |
| `enrollment_completed` | A lead reaches the end of the sequence | Mark outreach finished |
| `campaign_status_changed` | A campaign's status changes (for example started or paused) | Mirror campaign state |
| `account_disconnected` | A connected account needs signing in again or was disconnected | Alert the account owner |

Other groups (see the [Needle events table](https://needle.app/docs/webhooks) for every type):

- **Leads and sequences:** `lead_deleted`, `lead_enrolled`, `lead_skipped`, `lead_suppressed`, `enrollment_waiting`, `enrollment_stopped`, `message_generated`, `condition_evaluated`
- **Drafts and tasks:** `draft_created`, `draft_approved`, `draft_discarded`, `draft_failed`, `task_skipped`, `task_cancelled`, `task_failed` (`task_held` and `task_approved` are deprecated)
- **Campaigns and accounts:** `campaign_updated`, `account_connected`, `account_reconnected`, `account_deleted`, `account_paused`, `account_resumed`, `account_suspended`, `account_limits_updated`, `account_access_granted`, `account_access_revoked`, `account_sharing_changed`
- **Workspace:** `member_invited`, `member_joined`, `member_role_changed`, `member_removed`, `member_left`, `api_key_created`, `webhook_created`, `suppression_added`, `suppression_removed`
- **LinkedIn:** `linkedin_profile_visited`, `linkedin_invite_sent`, `linkedin_invite_withdrawn`, `linkedin_invite_accepted`, `linkedin_message_sent`, `linkedin_follow_sent`, `linkedin_unfollowed`, `linkedin_post_commented`, `linkedin_post_reacted`
- **Instagram:** `instagram_message_sent`, `instagram_message_received`, `instagram_profile_visited`, `instagram_follow_sent`, `instagram_unfollowed`, `instagram_post_commented`, `instagram_post_reacted`, `instagram_message_reacted`, `instagram_post_created`

## Event Payload Structure

```json
{
  "version": "v1",
  "id": "00000000-0000-0000-0000-000000000001",
  "type": "linkedin_message_received",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "data": {
    "id": "00000000-0000-0000-0000-000000000001",
    "type": "linkedin_message_received",
    "label": "Reply received",
    "occurredAt": "2026-01-01T12:00:00.000Z",
    "channel": "linkedin",
    "leadId": "00000000-0000-0000-0000-000000000002",
    "leadName": "Jane Doe",
    "leadEmail": "jane@example.com",
    "campaignId": "00000000-0000-0000-0000-000000000003",
    "enrollmentId": "00000000-0000-0000-0000-000000000004",
    "connectedAccountId": "00000000-0000-0000-0000-000000000005",
    "data": { "text": "Hello!" }
  }
}
```

- `timestamp` is when the event happened. Use it for ordering, since delivery is unordered.
- `data` is the same event object that Needle's Search events returns. Its own `data` field depends on the type.
- `leadEmail` and `leadIdentities` are empty when the event has no lead.

## Delivery

- **Headers:** `webhook-id` (the event id, unchanged on a resend), `webhook-timestamp` (Unix seconds when this request was sent), `webhook-signature`.
- **Acknowledge:** any `2xx` within 10 seconds.
- **Retries:** 3 tries: right away, 10 minutes later, 1 hour after the first. Events not delivered after 3 days are given up. A `429` pauses sending for a few seconds.
- **At least once, unordered:** up to 5 requests can be open at once. Dedupe on `webhook-id`.
- **Plan paused:** webhooks pause while the plan is inactive and missed events are not sent later. Fetch them with Search events.

## Full Event Reference

See [Needle's webhook documentation](https://needle.app/docs/webhooks).
