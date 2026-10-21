# NinjaOne Webhooks Overview

## What Are NinjaOne Webhooks?

NinjaOne (NinjaRMM) can push activity notifications to a callback URL. The API v2 spec
describes the `url` as the "Callback (WebHook) URL for activity notifications". Each
notification is one **activity** from the NinjaOne activity feed: a monitoring condition
firing or clearing, a script or automation running, a device being created, a patch
failing, and so on.

There are two ways to get a webhook, and only one can be authenticated:

| Method | Custom headers | Filters | Authenticate it? |
|--------|----------------|---------|------------------|
| API: `PUT /v2/webhook` | Yes, `headers` array of `name`/`value` | `activities`, `organizationIds` | Yes, with a shared-secret header |
| Console notification channel | No, URL only | Per notification channel | No |

NinjaOne doesn't sign webhooks. See [verification.md](verification.md).

## How Do I Identify the Event?

There's no `event` or `type` string. An activity is identified by two enum fields from the
API's `Activity` schema: `activityType` and `statusCode`. The spec lists the enums
separately and doesn't document which pairs occur, so treat the pairs below as the common
ones.

| activityType | statusCode | Triggered When | Common Use Cases |
|--------------|------------|----------------|------------------|
| `CONDITION` | `TRIGGERED` | A monitoring condition fires | Open a ticket, page on-call |
| `CONDITION` | `RESET` | The condition clears | Resolve the ticket or alert |
| `ACTION` | `STARTED`, `COMPLETED`, `CANCELLED` | A script or action runs on a device | Track remediation |
| `ACTIONSET` | `STARTED`, `COMPLETED`, `CANCELLED` | An automation (set of actions) runs | Track automation runs |
| `SYSTEM` | `NODE_CREATED`, `NODE_UPDATED`, `NODE_DELETED` | A device is added, changed or removed | Sync a CMDB |

Other `activityType` values in the spec: `CONDITION_ACTIONSET`, `CONDITION_ACTION`,
`ANTIVIRUS`, `PATCH_MANAGEMENT`, `SOFTWARE_PATCH_MANAGEMENT`, `MONITOR`, `SCRIPTING`,
`SECURITY`, `PSA`, `MDM`, `MAINTENANCE_MODE`, `NINJA_BACKUP`, `NINJA_TICKETING`, and more.
The `statusCode` enum has hundreds of values (for example `PATCH_MANAGEMENT_INSTALL_FAILED`,
`BITDEFENDER_SCAN_COMPLETED`), so filter at the source.

## Event Payload Structure

The fields below come from the `Activity` schema in the API spec. The spec doesn't include a
sample webhook delivery, so confirm the exact body with a real delivery (the Hookdeck CLI
shows it) before relying on optional fields.

```json
{
  "id": 1001,
  "activityTime": 1792577730.5,
  "deviceId": 42,
  "severity": "MAJOR",
  "priority": "HIGH",
  "seriesUid": "6bcedd3a-fe26-4bcb-9ce9-d3850e38d42c",
  "activityType": "CONDITION",
  "statusCode": "TRIGGERED",
  "status": "Triggered",
  "subject": "Disk free space low",
  "message": "C: has less than 10% free space",
  "data": {}
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | integer | Activity identifier; use with `statusCode` for deduplication |
| `activityTime` | number | Timestamp (double) |
| `deviceId` | integer | Device the activity relates to |
| `severity` | string | `NONE`, `MINOR`, `MODERATE`, `MAJOR`, `CRITICAL` |
| `priority` | string | `NONE`, `LOW`, `MEDIUM`, `HIGH` |
| `seriesUid` | string (uuid) | Job or condition UID; ties a `TRIGGERED` to its later `RESET` |
| `activityType`, `statusCode` | string | The event identity (see above) |
| `status` | string | Status description |
| `sourceName`, `sourceConfigUid` | string | Policy element that produced the activity |
| `subject`, `message` | string | Human-readable text |
| `userId` | integer | User involved, if any |
| `activityResult` | string | Result description |
| `type` | string | Activity type description |
| `data` | object | Activity-specific data |

The webhook's `expand` option controls which references are expanded in payloads.

## Full Event Reference

See the [NinjaOne API v2 spec](https://app.ninjarmm.com/apidocs/NinjaRMM-API-v2.json)
(`Activity` schema and `PUT /v2/webhook`) and the
[NinjaOne webhook documentation](https://app.ninjarmm.com/apidocs-beta/core-resources/articles/webhooks/overview).
