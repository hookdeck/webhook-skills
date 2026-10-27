# Box Webhooks Overview

## What Are Box V2 Webhooks?

A V2 webhook sends an HTTP payload to your HTTPS address when a trigger event happens on a file or folder (or on something inside a folder). You create it through the Box API (`POST /2.0/webhooks`) for one target, choose the triggers, and Box delivers a JSON body.

V1 webhooks (the old "Sent, Created, Uploaded, ..." list) are unsigned and not covered here. Box Sign has its own webhooks, also not covered.

## Common Event Types

The type is in `trigger` in the body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `FILE.UPLOADED` | A file is uploaded or moved to the folder | Ingest new documents, kick off processing |
| `FILE.DOWNLOADED` | A file is downloaded | Access auditing |
| `FILE.TRASHED` | A file is moved to trash | Sync deletions |
| `FOLDER.CREATED` | A folder is created | Provision project structure |
| `COMMENT.CREATED` | A comment is created | Notify reviewers |
| `COLLABORATION.CREATED` | A collaboration is created | Track sharing |
| `SIGN_REQUEST.COMPLETED` | A Box Sign request is completed | Fetch the signed document |

## All Triggers

Applies to files (F) and/or folders (D). Strings are exact.

| Group | Triggers |
|-------|----------|
| Collaboration (D) | `COLLABORATION.CREATED`, `COLLABORATION.ACCEPTED`, `COLLABORATION.REJECTED`, `COLLABORATION.REMOVED`, `COLLABORATION.UPDATED` |
| Comment (F, D) | `COMMENT.CREATED`, `COMMENT.UPDATED`, `COMMENT.DELETED` |
| Doc Gen (F) | `DOCGEN_DOCUMENT_GENERATION_STARTED`, `DOCGEN_DOCUMENT_GENERATION_SUCCEEDED`, `DOCGEN_DOCUMENT_GENERATION_FAILED` |
| File (F, D; `FILE.UPLOADED` D only) | `FILE.UPLOADED`, `FILE.PREVIEWED`, `FILE.DOWNLOADED`, `FILE.TRASHED`, `FILE.DELETED`, `FILE.RESTORED`, `FILE.COPIED`, `FILE.MOVED`, `FILE.LOCKED`, `FILE.UNLOCKED`, `FILE.RENAMED` |
| Folder (D) | `FOLDER.CREATED`, `FOLDER.RENAMED`, `FOLDER.DOWNLOADED`, `FOLDER.RESTORED`, `FOLDER.DELETED`, `FOLDER.COPIED`, `FOLDER.MOVED`, `FOLDER.TRASHED` |
| Metadata (F, D) | `METADATA_INSTANCE.CREATED`, `METADATA_INSTANCE.UPDATED`, `METADATA_INSTANCE.DELETED` |
| Shared link (F, D) | `SHARED_LINK.CREATED`, `SHARED_LINK.UPDATED`, `SHARED_LINK.DELETED` |
| Task (F, D) | `TASK_ASSIGNMENT.CREATED`, `TASK_ASSIGNMENT.UPDATED` |
| Box Sign (F, D) | `SIGN_REQUEST.COMPLETED`, `SIGN_REQUEST.DECLINED`, `SIGN_REQUEST.EXPIRED`, `SIGN_REQUEST.SIGNER_EMAIL_BOUNCED`, `SIGN_REQUEST.SIGNER_SIGNED`, `SIGN_REQUEST.SIGNATURE_REQUESTED`, `SIGN_REQUEST.ERROR_FINALIZING` |
| Webhook | `WEBHOOK.DELETED` |

## Event Payload Structure

```json
{
  "type": "webhook_event",
  "id": "eb0c4e06-751f-442c-86f8-fd5bb404dbec",
  "created_at": "2016-07-11T10:10:32-07:00",
  "trigger": "FILE.UPLOADED",
  "webhook": { "id": "53", "type": "webhook" },
  "created_by": { "type": "user", "id": "226067247", "name": "John Q. Developer", "login": "johnq@dev.name" },
  "source": { "id": "73835521473", "type": "file", "name": "Test-Image-3.png", "size": 26458 },
  "additional_info": []
}
```

- `id` is the event ID and stays the same across retries: dedupe on it.
- `source` is the file, folder or other object the event is about (full Box object, truncated above).
- Headers: `BOX-DELIVERY-ID` (unique per attempt, changes on retry), `BOX-DELIVERY-TIMESTAMP` (RFC 3339), `BOX-SIGNATURE-PRIMARY`, `BOX-SIGNATURE-SECONDARY`.

## Delivery and Retries

A delivery fails when Box doesn't get a `2xx` within 30 seconds. Box retries up to 5 times over 1 hour (Box notes these numbers could change). Respond fast and process asynchronously. Box's docs don't name the HTTP method ("Box makes an HTTP call to the `address`"); Hookdeck's Box source pre-selects POST and leaves the method unmanaged.

## Full Event Reference

For the complete list, see [Box webhook triggers](https://developer.box.com/guides/webhooks/triggers/) and [V2 webhook payloads](https://developer.box.com/guides/webhooks/v2/).
