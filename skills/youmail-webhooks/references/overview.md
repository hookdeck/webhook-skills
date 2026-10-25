# YouMail Webhooks Overview

## What Are YouMail Webhooks?

The YouMail Protective Services API (https://data.youmail.com/docs) can call a URL you control
whenever new call events, phone insights, TN report status changes or watchlist score changes
occur, so you don't have to poll. Webhooks are managed through `/api/v3/notifications/webhooks`.

Requests are always `POST` (the docs say the method "will default to POST and cannot be modified").
The URL must be https. Payloads are **not signed**. See [verification.md](verification.md) for
the optional `Authorization` header. The docs describe no retry schedule, delivery ID or
timestamp header, so make handlers idempotent.

## What Event Types Does YouMail Send?

There is no common envelope and no type field in the body. Each webhook is created for one
`eventType` (the `WebhookEventType` enum), and YouMail posts the matching payload:

| eventType | Triggered when | Body |
|-----------|----------------|------|
| `CALL_EVENT` | A new call event is produced | `{ "callEvents": ... }` |
| `PHONE_INSIGHTS` | There are new phone insights | `callAttestationSummaries`, `callCompletionSummaries`, `callLabelSummaries`, `callVolumeSummaries` arrays |
| `PROVIDER_TN_REPORT_STATUS` | The status of a TN report changes (one request per change) | `tnReportUuid`, `phoneNumber`, `status`, `statusChangeTime`, `takedownTime`, `reportCreateTime` |
| `WATCHLIST_SCORE_THRESHOLD` | Any number on a watchlist crosses a score threshold in either direction | `phoneNumber`, `oldSpamScore`/`newSpamScore`, `oldUnlawfulScore`/`newUnlawfulScore`, `oldFraudScore`/`newFraudScore`, `createdDate` |
| `WATCHLIST_PHONE_SCORE_THRESHOLD` | **Deprecated**: no longer emitted and new settings are rejected | Same shape as `WATCHLIST_SCORE_THRESHOLD` |

## How Do I Tell Them Apart?

Give each webhook its own URL (for example `/webhooks/youmail/call-events`,
`/webhooks/youmail/tn-reports`) and you know the type from the route. If you share one URL, the
examples detect the kind from the top-level keys: `callEvents`, any `*Summaries` array,
`tnReportUuid`, or `phoneNumber` with score fields. The string `CALL_EVENT` and the others are
labels the examples assign; they never appear in the body.

## Webhook Settings

`WebhookSettings` has `activeFlag`, `eventType` and `eventParams` (key/value pairs). All
webhooks need `url`; `method` defaults to `POST`; optional `auth` is `Basic` (needs `username`
and `password`) or `Bearer` (needs `token`). `WATCHLIST_SCORE_THRESHOLD` also needs
`watchlistUuid` and `threshold`.

## Full Reference

https://data.youmail.com/docs#tag/Webhooks
