# Incode Webhooks Overview

## What Are Incode Webhooks?

Incode is an identity verification platform. Its webhooks are asynchronous event notifications
from Incode to your application: one-way `POST` requests with a JSON body, sent when something
happens on the platform or when a process an end user started completes. You must configure
them before you receive any. Each webhook has a single destination URL; to fan out to several
systems, broadcast internally after receiving it. Requests are not signed; you authenticate them
with a custom header you add in the dashboard (see [verification.md](verification.md)).

## Which Event Name Field Does Each Webhook Use?

| Webhook | Name field | Values |
|---------|-----------|--------|
| Session webhooks | `event_type` | `SESSION_STARTED`, `SESSION_PROGRESS`, `SESSION_FAILED`, `SESSION_SUCCEEDED`, `SESSION_PENDING_REVIEW` |
| Identity Enrolled | `eventType` | `IDENTITY_ENROLLED` |
| Onboarding status | `onboardingStatus` | see below |

The handlers read `event_type`, then `eventType`, then `onboardingStatus`. Session webhooks
for finished sessions also carry `onboardingStatus: "ONBOARDING_FINISHED"`, so `event_type` must
win.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `SESSION_STARTED` | A Flow or Workflow session starts | Mark the applicant in progress |
| `SESSION_PROGRESS` | An end user resumes a session (a `/start` call after creation) | Track resumed sessions |
| `SESSION_SUCCEEDED` | A session succeeds | Approve the applicant, fetch results |
| `SESSION_FAILED` | A session fails | Reject or retry; read `failureReasons` |
| `SESSION_PENDING_REVIEW` | A session needs manual review | Queue for a reviewer |
| `IDENTITY_ENROLLED` | An Identity is created for the first time (not on updates) | Link `identityId` to your user |
| `ID_VALIDATION_FINISHED` | ID validation modules complete | Read OCR data and ID score early |
| `ID_VALIDATION_FINISHED_SECOND_ID` | Second ID validation modules complete | As above, for the second ID |
| `GOVERNMENT_VALIDATION_FINISHED` | Government validation tests complete | Preliminary results |
| `FACE_VALIDATION_FINISHED` | Face validation completes | Preliminary results |
| `POST_PROCESSING_FINISHED` | Collected interview data is done processing | Preliminary results |
| `POST_PROCESSING_FINISHED_SECOND_ID` | The same, for the second ID | Preliminary results |
| `ONBOARDING_FINISHED` | All data collected, rules applied, final status set | Fetch final session data |
| `MANUAL_REVIEW_APPROVED` | A `MANUAL` session is approved in the dashboard | Approve the applicant |
| `MANUAL_REVIEW_REJECTED` | A `MANUAL` session is rejected in the dashboard | Reject the applicant |
| `EXPIRED` | The user abandons a session past its time limit | Expire the applicant |
| `DELETED` | Session data is deleted (queued, so not instant) | Delete your copies |

Incode notes you will not receive a notification for the `UNKNOWN` status (a session the user
has not started); fetch it with the get session status endpoint instead.

## Event Payload Structure

Session webhooks (`SESSION_*`) share these fields: `event_type`, `timestamp` (ISO 8601 UTC),
`interviewId`, `externalCustomerId`, `clientId`, `configurationId`, and optionally
`integrationId`, `integrationType`, `loginHint`. `SESSION_STARTED` and `SESSION_PROGRESS` carry
only those. `SESSION_FAILED`, `SESSION_SUCCEEDED` and `SESSION_PENDING_REVIEW` add
`onboardingStatus` (always `ONBOARDING_FINISHED`), `devices`, and the legacy `ip`, `latitude`
and `longitude`. `SESSION_SUCCEEDED` and `SESSION_FAILED` can carry `identityId`;
`SESSION_FAILED` carries `failureReasons`, an array such as `["ID_VALIDATION", "LIVENESS"]`.

```json
{
  "event_type": "SESSION_FAILED",
  "interviewId": "664283755e0f8e1b87fcc2ce",
  "failureReasons": ["ID_VALIDATION", "LIVENESS"]
}
```

`IDENTITY_ENROLLED`:

```json
{
  "eventType": "IDENTITY_ENROLLED",
  "timestamp": "2026-05-20T14:00:00Z",
  "identityId": "65f8...",
  "interviewId": "65f7...",
  "clientId": "client-xyz",
  "configurationId": "flow-prod-onboarding"
}
```

Onboarding status:

```json
{
  "clientId": "MyClientId001",
  "flowId": "66969519eb1d789a96347ca7",
  "interviewId": "664283755e0f8e1b87fcc2ce",
  "externalCustomerId": "MyCustomerID#0001",
  "onboardingStatus": "ONBOARDING_FINISHED"
}
```

`DELETED` carries `interviewIds` (an array) instead of `interviewId`.

## Other Webhooks

Video selfie upload, global watchlists (`interviewId`, `ref`, `search_id`), face authentication,
KYB results, work history and proof of payment (the last two are Mexico only) each have their
own payload. The examples authenticate them like any other, then log them as unhandled. The
authentication and INE scraping webhooks are deprecated.

## Delivery and Retries

Incode retries on a timeout or any response that is not `200` with `application/json`, or `204`:
5 attempts, 30s initial interval, multiplier 2.5, about 32 minutes in total. Handle duplicates
idempotently. Webhooks come from a fixed set of Incode IP addresses (listed in the docs per
region), which you can allowlist as an extra layer.

## Full Event Reference

- [Webhooks overview](https://developer.incode.com/general-reference/webhooks-overview)
- [Session webhooks](https://developer.incode.com/general-reference/session-webhooks)
- [Onboarding status webhook](https://developer.incode.com/general-reference/onboarding-status-webhook)
