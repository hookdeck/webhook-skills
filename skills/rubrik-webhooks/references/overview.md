# Rubrik Webhooks Overview

## What Are Rubrik Webhooks?

Rubrik Security Cloud (RSC) pushes **events** (backups, recoveries, anomalies, archival,
replication, ...) and **audits** (user and configuration actions) to an HTTP endpoint as JSON.
RSC keeps only 90 days of events, so webhooks are the usual way to stream them into an
incident, SIEM or reporting system.

Each webhook has:

- a **URL** and a **provider type** (`CUSTOM` for your own endpoint; also `PAGERDUTY`, `SPLUNK`,
  `MICROSOFT_SENTINEL`, `GOOGLE_SECOPS`, `LOGSCALE`)
- a **subscription**: `eventSubscription` and/or `auditSubscription`, filtered by type, object
  type and severity
- an optional **custom JSON template**
- **authentication** (`authInfo.authType`): `CUSTOM_HEADER`, `BEARER`, `BASIC`, `OAUTH2` or `URL`.
  Payloads are **not signed**.

## Default Event Payload (PD-CEF)

The default format is PagerDuty Common Event Format. Example from Rubrik's developer docs:

```json
{
  "summary": "Failed backup of vSphere VM 'sh1-EncryptMe-05-Group1'.",
  "source": "Rubrik Security Cloud",
  "severity": "critical",
  "timestamp": "2024-07-18T06:39:40.46Z",
  "class": "Backup",
  "custom_details": {
    "seriesId": "ccd7a8a5-4c58-4c88-bff9-7bdffddb6099",
    "id": "c2b47274-6323-4025-b307-afed1cfb7574",
    "type": "Event",
    "objectId": "83c4a80a-4a57-5699-b399-651089135586",
    "objectName": "sh1-EncryptMe-05-Group1",
    "objectType": "VmwareVm",
    "status": "Failure",
    "clusterId": "6a271636-9392-4cba-90c5-bdbe227854ab",
    "clusterName": "sh1-PaloAlto",
    "eventName": "Snapshot.BackupFailed",
    "errorId": "Snapshot.VmwareSnapshotError",
    "errorCode": "",
    "errorRemedy": "",
    "errorReason": "",
    "auditUserName": "",
    "auditUserId": "",
    "location": "sh1-paloalto-vcsa.rubrikdemo.com",
    "url": "",
    "customerID": "rubrik-gaia",
    "logicalSizeInBytes": "",
    "dataTransferredInBytes": "",
    "effectiveThroughput": ""
  }
}
```

| Field | Meaning |
|-------|---------|
| `summary` | Human-readable message |
| `severity` | e.g. `critical` |
| `timestamp` | RFC 3339 time of the event |
| `class` | Activity class, e.g. `Backup`, `Anomaly` |
| `custom_details.id` | Activity ID (use for deduplication) |
| `custom_details.seriesId` | Activity series ID (groups related events, e.g. one backup job) |
| `custom_details.type` | `Event` |
| `custom_details.status` | Activity status, e.g. `Failure`, `Success` |
| `custom_details.objectName` / `objectType` / `objectId` | The protected object |
| `custom_details.eventName` | Fine-grained name, e.g. `Snapshot.BackupFailed` |

Many fields are empty strings rather than absent. Numeric-looking fields
(`logicalSizeInBytes`, ...) are strings.

## Common Event Types

Route on `status` and `class`; there is no single event-type string.

### Status (`custom_details.status`, Rubrik `ActivityStatusEnum`)

| Status | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `Failure` | An activity (e.g. backup) failed | Open an incident, page on-call |
| `Success` | An activity completed | Record SLA compliance |
| `PARTIAL_SUCCESS` | Completed with warnings | Ticket for follow-up |
| `Warning` | Warning-level activity | Review queue |
| `Canceled` / `Canceling` | Job canceled | Audit trail |
| `Running` / `Queued` | Job in progress | Progress dashboards |
| `Info` | Informational | Logging |
| `TaskSuccess` / `TaskFailure` | Task-level outcome | Same as Success/Failure |

### Class (`class`, Rubrik `ActivityTypeEnum`)

Common values: `Backup`, `Anomaly` (ransomware/anomaly detection), `Recovery`, `Archive`,
`Replication`, `Index`, `Classification`, `Configuration`, `Hardware`, `Storage`, `System`,
`ThreatHunt`. Treat unknown values as pass-through; Rubrik adds new ones.

### Subscription filters (`EventType`, `EventSeverity`)

When creating the webhook you choose which events to receive with `EventType` enum values such
as `BACKUP`, `ANOMALY`, `RECOVERY`, `ARCHIVE`, `REPLICATION`, `THREAT_HUNT`,
`THREAT_MONITORING`, ... (or `isSubscribedToAllEvents: true`) and severities
`SEVERITY_CRITICAL`, `SEVERITY_WARNING`, `SEVERITY_INFO`.

## Custom Templates

Templates are freeform JSON with Go-template variables. Event variables:

| Variable | Example |
|----------|---------|
| `{{.Message}}` | `Failed backup of vSphere VM ...` |
| `{{.Severity}}` | `critical` |
| `{{.Time}}`, `{{.Time.Unix}}`, `{{.Time.UnixMilli}}` | event time |
| `{{.Class}}` | `Backup` |
| `{{.ActivitySeriesID}}` | series ID |
| `{{.UUID}}` | activity ID |
| `{{.ActivityType}}` | `Event` |
| `{{.Status}}` | `Failure` |
| `{{.ObjectID}}`, `{{.ObjectName}}`, `{{.ObjectType}}` | object |
| `{{.ClusterUUID}}`, `{{.ClusterName}}`, `{{.Location}}`, `{{.URL}}` | context |
| `{{.Error.Message}}`, `{{.Error.ID}}`, `{{.Error.ErrorCode}}`, `{{.Error.Remedy}}`, `{{.Error.Reason}}` | error detail |

Audit webhooks add `{{.AuditType}}`, `{{.AuditSeriesID}}`, `{{.UserName}}`, `{{.UserID}}`,
`{{.IPAddress}}`, `{{.UserNote}}`, `{{.OrgID}}` and `{{.AuditInfo}}`.

A flat template like this works with the example handlers unchanged:

```json
{
  "id": "{{.UUID}}",
  "type": "{{.ActivityType}}",
  "class": "{{.Class}}",
  "status": "{{.Status}}",
  "severity": "{{.Severity}}",
  "objectName": "{{.ObjectName}}",
  "objectType": "{{.ObjectType}}",
  "message": "{{.Message}}"
}
```

## Delivery

- Retries: 3 attempts with 1s, 5s and 10s backoff, then the event is removed from the queue.
- The webhook is auto-disabled after 25 consecutive failures.

## Full Event Reference

- [Rubrik Security Cloud API: Events and webhooks](https://developer.rubrik.com/Rubrik-Security-Cloud-API/Observability/Events/)
- [EventType enum](https://developer.rubrik.com/Rubrik-Security-Cloud-API/API-Reference/types/enums/EventType/)
- [ActivityStatusEnum](https://developer.rubrik.com/Rubrik-Security-Cloud-API/API-Reference/types/enums/ActivityStatusEnum/)
