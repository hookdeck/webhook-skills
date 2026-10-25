# Certn Webhooks Overview

## What Are Certn Webhooks?

Certn is a background check platform. Its API sends updates as POST requests to the webhook URL you set on the Partner page, as results become available. Secrets and the webhook URL are set at the Partner level: partner resellers use the same webhook and secret across all accounts and sub-accounts.

Certn has **no event types**. There is no `type` or `event` field. Each delivery is the applicant (report) object, the same shape you get when you retrieve the results of an application, so you decide what to do from its status fields.

## Which Fields Do I Dispatch On?

| Field | Values seen in the docs | Meaning |
|-------|-------------------------|---------|
| `report_status` | `IN_PROGRESS`, `COMPLETE` | Progress of the whole application order |
| `result` | `NONE`, `CLEARED` | Application result (score), with a readable `result_label` |
| `order_status` | `COMPLETE` | Order progress |
| `check_executions[].status` | `WAITING_ON_CANDIDATE`, `COMPLETE` | Progress of each individual check (`check_name`, for example `criminal_record_check`) |

Certn documents more values than these (see its [Application and check statuses](https://help.certn.co/hc/en-us/articles/14633780753427) and [Application scores](https://help.certn.co/hc/en-us/articles/25159183963923) articles), so keep a default branch that logs and acknowledges unknown values. The examples handle `COMPLETE` and `IN_PROGRESS`.

## Payload Structure

```json
{
  "id": "1ba124f1-d473-44c0-a066-d623b2cb6253",
  "short_uid": "pmndgAeH",
  "applicant_type": "Standard",
  "is_submitted": true,
  "check_executions": [
    { "id": "check_exec_SYS5AS3GLcZZpo0i1GfNXQ", "check_name": "criminal_record_check", "status": "COMPLETE" }
  ],
  "result": "CLEARED",
  "result_label": "Cleared",
  "report_status": "COMPLETE",
  "order_status": "COMPLETE",
  "information": { "first_name": "Andrew", "last_name": "Mcleod", "addresses": [] }
}
```

The real payload is large: it also carries the `request_*` flags for the checks ordered, `created` / `modified` / `last_updated` / `submitted_time` timestamps, `certn_score*` fields, and the applicant's `information` (names, addresses, employers, educations, identity numbers). Treat it as personal data.

## Retries

Certn retries up to three additional times, waiting longer between calls, when your endpoint returns `408`, `500`, `502`, `503`, or `504`. For any other status over 399, it backs off on the first try. Certn generates a new timestamp and signature for each attempt; Hookdeck retries and replays resend the original request, including the original timestamp.

## Full Reference

See [Certn's webhook documentation](https://docs.certn.co/api/guides/use-the-api/webhooks) and the [webhook parameters and example](https://docs.certn.co/api/guides/use-the-api/webhooks/webhook-parameters-and-example).
