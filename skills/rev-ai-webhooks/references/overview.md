# Rev AI Webhooks Overview

## What Are Rev AI Webhooks?

Rev AI's asynchronous speech-to-text API accepts a job (a media URL or file) and processes it
in the background. If the job includes the optional `notification_config`, Rev AI makes an HTTP
`POST` to `notification_config.url` when the job either completes successfully or fails. There
is one webhook per job outcome and no event-type field: the outcome is `job.status`.

Payloads are not signed. Authentication is the `Authorization` header you set in
`notification_config.auth_headers`.

## Job Statuses Sent by Webhooks

| `job.status` | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `transcribed` | Processing is complete and results are available | Fetch the transcript, update your record, notify the user |
| `failed` | Processing failed | Alert, fix the cause, resubmit |

The API also has an `in_progress` status, but it is not sent by webhooks.

## Event Payload Structure

Successful job (from the Rev AI docs):

```json
{
  "job": {
    "id": "Umx5c6F7pH7r",
    "status": "transcribed",
    "created_on": "2018-05-05T23:23:22.29Z",
    "duration_seconds": 356.24
  }
}
```

Failed job:

```json
{
  "job": {
    "id": "Umx5c6F7pH7r",
    "status": "failed",
    "created_on": "2018-05-05T23:23:22.29Z",
    "failure": "download_failure",
    "failure_detail": "Failed to download media file. Please check your url and file type"
  }
}
```

Other job fields documented in the API reference may also appear, such as `completed_on`,
`metadata` (the string you passed at submission) and `delete_after_seconds`.

| Field | Notes |
|-------|-------|
| `job.id` | Use it to fetch the transcript and to deduplicate retries |
| `job.status` | `transcribed` or `failed` |
| `job.created_on` / `job.completed_on` | ISO-8601 UTC |
| `job.failure` | Present when failed: `internal_processing`, `download_failure`, `duration_exceeded`, `duration_too_short`, `invalid_media`, `empty_media`, `transcription`, `insufficient_balance`, `invoicing_limit_exceeded`, `custom_vocabulary` |
| `job.failure_detail` | Human-readable reason |
| `job.metadata` | Your own string (up to 512 chars), useful for correlating with your records |

The webhook does **not** contain the transcript. Fetch it afterwards with
`GET https://api.rev.ai/speechtotext/v1/jobs/{id}/transcript`.

## Delivery and Retries

Respond with `200` to acknowledge. If the callback does not get a `200`, Rev AI retries the URL
every 30 minutes until 24 hours have passed or a `200` is received. Duplicate deliveries are
therefore possible: handle them idempotently.

## Full Event Reference

See [Rev AI's webhook documentation](https://docs.rev.ai/api/asynchronous/webhooks/) and the
[API reference](https://docs.rev.ai/_bundle/api/asynchronous/reference.yaml).
