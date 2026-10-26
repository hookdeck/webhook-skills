# Egnyte Webhooks Overview

## What Are Egnyte Webhooks?

The Egnyte Webhooks API lets you subscribe to real-time events in your Egnyte domain. When a
registered event occurs (a file upload, folder creation or permission change), Egnyte sends an
HTTP POST to your endpoint with the event details, so you don't have to poll the Events API.

Webhooks carry no signature. The only authentication is the `authHeader` value you set at
registration, sent back as the `Authorization` header (see [verification.md](verification.md)).
Delivery needs a public HTTPS endpoint with a valid CA-signed certificate; self-signed
certificates are rejected.

## What Does the Payload Look Like?

`POST` with `Content-Type: application/json`. The body is an object with a `data` array, so a
single request can hold several events:

```json
{
  "data": [
    {
      "eventId": "...",
      "domain": "...",
      "timestamp": 1710000000000,
      "user": { "id": 1, "displayName": "...", "username": "...", "email": "..." },
      "actionSource": "...",
      "eventType": "fs:add_file",
      "webhookId": "...",
      "data": {}
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `eventId` | Unique per Egnyte domain; use it for deduplication |
| `domain` | The Egnyte domain where the event occurred |
| `timestamp` | Unix time in milliseconds |
| `user` | Who triggered the event (`id`, `displayName`, `username`, `email`; optional `clientIdHash`, `impersonatedBy`) |
| `actionSource` | API or client used to perform the action |
| `eventType` | Canonical event name. If an event maps to several names, this is the most specific |
| `webhookId` | ID of the webhook registration |
| `customProperties` | Optional whitelisted internal properties |
| `data` | Event-specific payload; the schema varies by `eventType` |

`user.clientIdHash` is the SHA-1 hash of the OAuth client ID that caused the event, useful for
ignoring changes your own application made.

## What Event Types Does Egnyte Send?

Subscribe with exact names or a category wildcard (`fs:*`, `link:*`, `comment:*`,
`permission:*`, `meta:*`). Workflow and group events have no wildcard.

| Category | Events |
|----------|--------|
| File system | `fs:add_file`, `fs:add_folder`, `fs:upload_link`, `fs:copy_file`, `fs:copy_folder`, `fs:delete_file`, `fs:delete_folder`, `fs:delete_from_trash`, `fs:move_file`, `fs:move_folder`, `fs:restore_from_trash`, `fs:lock_file`, `fs:unlock_file`, `fs:folder_project_activity` |
| Links | `link:create`, `link:create_download_link`, `link:create_upload_link`, `link:delete`, `link:delete_download_link`, `link:delete_upload_link` |
| Comments | `comment:set_comment`, `comment:remove_comment` |
| Permissions | `permission:permission_change` |
| Metadata | `meta:add_metadata_key`, `meta:delete_metadata_key` |
| Workflows | `workflow:created`, `workflow:completed`, `workflow:approvaltask_approved`, `workflow:approvaltask_rejected` |
| Groups | `group:create`, `group:delete`, `group:rename`, `group:add_members`, `group:remove_members`, `group:add_owner`, `group:remove_owner` |

Event-specific `data` examples:

- `fs:add_file`: `targetPath`, `targetEntryId`, `targetGroupId`, `targetFileChecksum`, `itemType` (`file` or `version`)
- `fs:delete_file`: `targetPath`, `targetEntryId`, `targetGroupId`, `targetFileChecksum`
- `fs:move_file`: `sourcePath`, `targetPath`, `targetEntryId`, `targetGroupId`
- `fs:add_folder`: `targetPath`
- `comment:set_comment`: `targetPath`, `comment`
- `permission:permission_change`: `folderPath`, `newPrivilege`, `oldPrivilege`, `assignerId`
- `group:add_members`: `groupName`, `groupId`, `members`
- `workflow:completed`: `workflow`, `firstEntity`, `completionStatusCode`, `totalNumberOfSteps`, `completionDate`

Egnyte lists `user:*` events as not yet supported, and says further workflow events are planned.
Treat `eventType` as an open string and ignore ones you don't handle (still return `200`).

## How Does Egnyte Retry Deliveries?

Your endpoint must answer with **HTTP 200**. Any other status is retried immediately, then
after 1 minute, 10 minutes and 1 hour (four attempts in total). Once the retries are used up
the webhook registration is **disabled** and you must re-enable it (see
[setup.md](setup.md)). Registrations also have an `expires` timestamp.

## Full Reference

See https://developers.egnyte.com/integration/cfs/api-docs/webhooks-api
