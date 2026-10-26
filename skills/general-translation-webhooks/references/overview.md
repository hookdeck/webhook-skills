# General Translation Webhooks Overview

## What Are General Translation Webhooks?

[General Translation](https://generaltranslation.com) is an AI localization platform. Webhooks send translation events to your backend as signed HTTP POST requests, so you can trigger your own workflows when translated files or translation jobs change. Webhooks require a Starter or Enterprise plan.

Each delivery is an HTTPS POST with a JSON body. Signatures follow the [Standard Webhooks](https://www.standardwebhooks.com/) convention (`webhook-id`, `webhook-timestamp`, `webhook-signature`).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `translated_file.completed` | A translated file is completed and ready to download | Pull the file into your repo or CDN, open a pull request |
| `translated_file.edited` | A user manually edits a translated file in the translation editor | Re-sync the edited file, notify reviewers |
| `translation_job.completed` | A translation job completes | Mark a release as localized, start a deploy |

These are the three documented event types, and the list may not be exhaustive. Each endpoint subscribes to one or more of them. Acknowledge any other type with `200`.

## Event Payload Structure

```json
{
  "id": "evt_xxx",
  "object": "event",
  "type": "translated_file.completed",
  "createdAt": "2026-04-30T12:00:00.000Z",
  "apiVersion": "2026-03-06.v1",
  "data": {
    "object": {
      "object": "translated_file",
      "id": "trf_xxx",
      "orgId": "org_xxx",
      "projectId": "project_xxx",
      "branchId": "branch_xxx",
      "sourceFileId": "src_xxx",
      "fileId": "file_xxx",
      "versionId": "ver_xxx",
      "locale": "fr",
      "fileFormat": "JSON",
      "dataFormat": null,
      "completedAt": "2026-04-30T12:00:00.000Z"
    }
  }
}
```

- `id` (`evt_...`) is a stable event identifier and equals the `webhook-id` header. Use it to dedupe.
- `object` is always `event`. The resource kind is `data.object.object` (`translated_file` or `translation_job`). Switch on the top-level `type`, not on the resource kind.
- Field names are camelCase. Event types and resource kinds are snake_case.
- `createdAt` is when the event record was created. Fields in `data.object` are captured then and reused for retries and manual replays, even if the resource changes afterward.
- `translated_file.edited` has the same fields as the completed file but `editedAt` replaces `completedAt`.
- `translation_job.completed` carries only the job:

```json
{ "object": "translation_job", "jobId": "job_xxx", "completedAt": "2026-04-30T12:00:00.000Z" }
```

## Delivery and Retries

- At-least-once delivery. Duplicates are possible.
- A non-2xx response, or no response within 10 seconds, is retried with exponential backoff for up to 10 attempts.
- Retry a failed delivery manually from **Organization > Developer > Webhook Events**: select the event, hover a row under **Delivery attempts** and click **Retry**.
- Failed attempts show an **Error** field with the HTTP status and a sanitized excerpt (at most 500 characters) of your response body.
- No ordering guarantee is documented.

## Full Event Reference

See [General Translation's webhook documentation](https://generaltranslation.com/en-US/docs/platform/dashboard/reference/webhooks).
