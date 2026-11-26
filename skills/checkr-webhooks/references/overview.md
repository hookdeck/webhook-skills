# Checkr Webhooks Overview

## What Checkr Sends

Checkr runs background checks for employers and for platforms that embed Checkr. Each time an event you subscribed to occurs, Checkr sends a `POST` with a JSON event to your webhook URL. The `User-Agent` starts with `Checkr-Webhook/`.

```json
{
  "id": "1002d6bca6acdfcbb8442178",
  "object": "event",
  "type": "object.event",
  "created_at": "2018-08-17T01:12:43Z",
  "webhook_url": "https://notify.company.com/checkr",
  "data": {
    "object": { "id": "a13f4827d8711ddc75abc56ct", "object": "object", "uri": "/v1/objects/a13f4827d8711ddc75abc56ct" }
  }
}
```

| Field | Meaning |
|---|---|
| `id` | Event ID: dedupe on it |
| `type` | Event type, such as `report.completed` |
| `created_at` | ISO 8601 time of the event |
| `webhook_url` | The URL the event was sent to |
| `data.object` | The related object: full when `include_object` is on, otherwise `id`, `object` and `uri` |

`include_object` is on by default for Partner applications.

## Event Types

From [Checkr's webhooks reference](https://docs.checkr.com/apis/webhooks):

| Group | Events |
|---|---|
| Candidate | `candidate.created`, `candidate.id_required`, `candidate.driver_abstract_required`, `candidate.driver_license_required`, `candidate.updated`, `candidate.pre_adverse_action`, `candidate.post_adverse_action` |
| Invitation | `invitation.created`, `invitation.completed`, `invitation.expired`, `invitation.deleted` (the Partner guide lists `invitation.cancelled`) |
| Verification | `verification.created`, `verification.completed`, `verification.processed` |
| Report | `report.created`, `report.updated`, `report.canceled`, `report.upgraded`, `report.completed`, `report.suspended`, `report.resumed`, `report.paused`, `report.disputed`, `report.dispute_completed`, `report.pre_adverse_action`, `report.post_adverse_action`, `report.engaged` |
| Adverse action | `adverse_action.created`, `adverse_action.completed`, `adverse_action.paused`, `adverse_action.resumed`, `adverse_action.canceled`, `adverse_action.notice_not_delivered` |
| Package | `package.created`, `package.updated`, `package.deleted` |
| Continuous check | `continuous_check.subscription_error`, `continuous_check.confirmation_required` |
| Form I-9 | `form_i9_v2.created`, `form_i9_v2.updated`, `form_i9_v2.completed` |
| Partner apps | `account.connected`, `account.credentialed`, `token.deauthorized` ([Partner guide](https://docs.checkr.com/partners/webhooks)) |

Partner applications are subscribed to all events by default. Checkr recommends consuming the object payload rather than relying on the event type alone.

## Ordering and Duplicates

Checkr doesn't guarantee delivery order. A `consider` report can produce `report.completed` and `report.engaged` in either order, and `verification.processed` can arrive before `verification.completed`. Checkr also warns that rapid report updates can produce duplicates or be missed, and suggests:

- treating repeated `report.completed` updates for the same report within a window (its example is 60 minutes) as duplicates
- alerting when no `report.completed` arrives within a few days

## Delivery and Retries

| Topic | Behaviour |
|---|---|
| Acknowledge | Any `2xx`. Checkr ignores the response headers and body |
| Retries | Every minute for 10 minutes, then every hour for 24 hours |
| Removal (direct) | A URL that fails 100% of requests for 60 days or more is removed. A URL that received nothing in that time is kept |
| Removal (Partner) | Webhooks failing for more than 7 consecutive days are deleted |
| URLs | Up to two webhook URLs per account. HTTPS (HTTP is accepted in the test environment for Partner apps) or AWS SNS |
| Basic auth | Supported by putting `user:password@` in the URL (URL-escaped) |
| Logs | [dashboard.checkr.com/webhook_logs](https://dashboard.checkr.com/webhook_logs) |
