# Ashby Webhooks Overview

## What Are Ashby Webhooks?

Ashby (an applicant tracking system / recruiting platform) uses webhooks to
notify your application when events happen in your hiring pipeline — a candidate
submits an application, moves to a new interview stage, gets hired, or an offer
is created. Instead of polling the Ashby API, Ashby sends an HTTP POST request to
your configured endpoint whenever a subscribed event occurs.

Webhooks are useful for syncing candidates to a data warehouse, triggering
onboarding when someone is hired, notifying Slack on stage changes, or driving
custom recruiting automation.

## The Payload Shape

Every Ashby webhook has the same top-level structure. The event name lives in the
body (`action`), **not** in a header:

```json
{
  "webhookActionId": "75395d87-4044-4dc4-bc29-0cec185e5f06",
  "action": "candidateStageChange",
  "data": {
    // event-specific fields
  }
}
```

`webhookActionId` identifies the underlying event. Ashby keeps it the same across
retries, across several webhooks configured for the same event, and across the
related webhooks one action fans out to.

Dispatch on `payload.action` after verifying the signature.

## Common Event Types

Event names are **camelCase** with no dot notation (e.g. `interviewScheduleCreate`,
not `interviewSchedule.create`).

| Event (`action`) | Triggered When | Common Use Cases |
|------------------|----------------|------------------|
| `ping` | A webhook is created or edited (test event) | Verify endpoint connectivity |
| `applicationSubmit` | A candidate submits an application | Sync candidates, notify recruiters |
| `applicationUpdate` | An application changes (stage, status, fields) | Keep external systems in sync |
| `candidateHire` | A candidate is marked hired | Trigger onboarding, HRIS provisioning |
| `candidateStageChange` | A candidate moves to a new interview stage | Pipeline analytics, Slack alerts |
| `candidateDelete` | A candidate is deleted | Data cleanup, compliance |
| `candidateMerge` | Two candidate records are merged | Deduplicate downstream records |
| `interviewScheduleCreate` | An interview schedule is created | Calendar sync, interviewer prep |
| `interviewScheduleUpdate` | An interview schedule is updated | Reschedule automation |
| `offerCreate` | An offer is created | Offer tracking, approvals |
| `offerUpdate` | An offer is updated | Keep offer state in sync |
| `jobPostingUpdate` | A job posting changes | Sync careers site |
| `jobPostingPublish` | A job posting is published | Publish to job boards |
| `pushToHRIS` | Data is pushed to an HRIS | HRIS integration |

## Fan-Out Events

Some events trigger additional events. For example, `candidateHire` also fires
`applicationUpdate` and `candidateStageChange`, all with the same
`webhookActionId`. Because you may receive several related webhooks for one
logical action, and retries repeat the same `webhookActionId`, **make handlers
idempotent**: deduplicate on `webhookActionId` plus `action`. Keying on
`webhookActionId` alone would drop the fanned-out events.

## Retries

Ashby retries a failed delivery (non-2xx or timeout) with exponential backoff,
`(2^attempt - 1) × 10` seconds, up to 10 attempts. It does not retry `401`,
`403`, `404`, `405` or `410`. See
[Retries](https://developers.ashbyhq.com/docs/retries).

## Event Headers

| Header | Description |
|--------|-------------|
| `Ashby-Signature` | HMAC SHA-256 signature of the raw body, as `sha256=<hex>` |
| `Ashby-Webhook` (User-Agent) | Identifies Ashby requests — **not** a security control |

## Ping on Create or Edit

When you create or edit a webhook, Ashby sends a `ping` event. If your endpoint
does not respond, or responds with an error code, the webhook is still saved but
**disabled**. After fixing your endpoint, check "enabled" and click "Update" to
send a new ping. Always return `2xx` quickly once the signature is verified.

## Full Event Reference

For the complete list of events and payloads, see:
- [Setting Up Webhooks](https://developers.ashbyhq.com/docs/setting-up-webhooks)
- [Authenticating Webhooks](https://developers.ashbyhq.com/docs/authenticating-webhooks)
- [Webhook payloads](https://developers.ashbyhq.com/reference/applicationsubmitwebhook)
