# Navattic Webhooks Overview

## What Are Navattic Webhooks?

Navattic's Webhook integration sends the raw event data from your interactive demos to any URL.
An event is sent whenever a **visitor session in your demo is marked as closed**. The event
contains the session, including its recorded events, the end user (visitor) and the company
account, if any.

Webhooks are not signed. The only authentication is an `Authorization` header (`Basic <credentials>`
or `Bearer <token>`) that Navattic sends **only when configured on the webhook** (see
[verification.md](verification.md)). Navattic's page describes no retries or event ID, so make
handlers idempotent.

## What Events Does Navattic Send?

| `eventType` | Triggered When | Common Use Cases |
|-------------|----------------|------------------|
| `session_closed` | A visitor session in a demo closes | Push demo engagement to a CRM, notify sales, enrich accounts |

`eventType` is "currently always `session_closed`". There are two webhook action types that share
the same envelope but differ in what `data` contains:

- **Visitor event**: the full session, visitor and account details
- **Account event**: the company account details only

## Event Payload Structure

```json
{
  "eventType": "session_closed",
  "timestamp": "2026-07-14T18:32:05.000Z",
  "data": { "session": {}, "endUser": {}, "companyAccount": {} }
}
```

| Field | Description |
|-------|-------------|
| `eventType` | The type of event (always `session_closed` today) |
| `timestamp` | ISO 8601 time the session closed |
| `data` | Visitor events: `{ session, endUser, companyAccount }`. Account events: the company account object only |

- `data.session`: `type` (`INTERACTIVE_DEMO` or `AGENT_DEMO`), `createdAt`, `closedAt`, `mostRecentDemoName`, `recordedEvents`. Interactive demo sessions add `recordedGuideSessionId`, `mostRecentProjectId`, `mostRecentShareLinkId` (and `shareLink` or `presentation`); agent demo sessions add `agentDemoSessionId` and `agentDemoId`.
- `data.endUser`: `id`, `sharedId`, `mostRecentEmail`, `mostRecentName`, `mostRecentCompany`, location fields, `converted`, `navigated`, `engaged`, `companyAccountId`, `customPropertyValues`.
- `data.companyAccount`: `id`, `name`, `websiteDomain`, `engaged`, enrichment fields (`sector`, `industry`, `employeeCount`, ...), `customPropertyValues`. It is `null` on visitor events when no account matched, and it is the whole `data` object on account events.
- Recorded event `type` values: `VIEW_STEP`, `START_FLOW`, `COMPLETE_FLOW`, `START_CHECKLIST`, `OPEN_CHECKLIST`, `CLOSE_CHECKLIST`, `IDENTIFY_USER`, `ENGAGE`, `CONVERTED`, `NAVIGATE`, `COMPLETE_TASK`, `SESSION_CLOSED`.
- When a Launchpad presentation is connected to a Salesforce opportunity, payloads also carry `opportunityOwnerEmail` and `opportunityOwnerId`.

Large numeric values such as `estimatedAnnualRevenue` are sent as strings.

## Request Headers

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `User-Agent` | `navattic-tour` |
| `Authorization` | Only sent when configured on the webhook: `Basic <credentials>` or `Bearer <token>` |

## Full Event Reference

See [Navattic's webhook documentation](https://docs.navattic.com/integrations/webhook).
