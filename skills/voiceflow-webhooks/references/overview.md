# Voiceflow Webhooks Overview

## What Are Voiceflow Webhooks?

[Voiceflow](https://www.voiceflow.com) is an AI-agent building platform. Organization events
webhooks send an HTTPS `POST` to one URL whenever a project or a project environment changes
in your organization. Svix delivers and signs them, so events come from
[Svix's IP addresses](https://docs.svix.com/receiving/source-ips) rather than Voiceflow's.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Scope | One URL per organization; every organization event is sent to it |
| Acknowledgement and retries | Voiceflow states no acknowledgement, timeout or retry policy |

Only organization event webhooks are covered here. The project-level session webhook doesn't
document this signing scheme (see [setup.md](setup.md)).

## Event Payload Structure

Every payload has the same envelope:

| Field | Meaning |
|-------|---------|
| `type` | The event name, e.g. `organization.project.created` |
| `data` | Event details: `organizationID`, `projectID`, `projectMetadata.name`, `workspaceID`, plus event-specific fields |
| `resource` | `organization-<organizationID>` |
| `time` | Event time as a Unix timestamp in milliseconds |

```json
{
  "type": "organization.project.environment.published",
  "data": {
    "organizationID": "LVkmPy8AE2",
    "projectID": "69e8b60a99c9a35e1a5e8872",
    "projectMetadata": { "name": "My support agent" },
    "publishedBy": { "type": "user", "userEmail": "user@voiceflow.com" },
    "publishedProjectEnvironmentID": "69e8b60a99c9a35e1a5e8875",
    "publishedProjectEnvironmentMetadata": { "alias": "main", "isLive": true, "name": "Main", "trafficPercentage": 70 },
    "publishedVersionIDAfter": "6a16f4b29e4196323d8a49db",
    "publishedVersionIDBefore": "69e8e543ce546b913fc2c965",
    "workspaceID": "95kwAZ63nO"
  },
  "resource": "organization-LVkmPy8AE2",
  "time": 1779889330124
}
```

## Common Event Types

Six events are documented. The list may not be exhaustive, so acknowledge unknown types with `200`.

| Event | Triggered When | Key `data` fields |
|-------|----------------|-------------------|
| `organization.project.created` | A new project is created | `createdBy`, `projectID`, `projectMetadata.name` |
| `organization.project.deleted` | A project is deleted | `deletedBy`, `projectID`, `projectMetadata.name` |
| `organization.project.environment.created` | An environment is created within a project | `createdProjectEnvironmentID`, `createdProjectEnvironmentMetadata`, `source.environmentID` (the environment it was branched from) |
| `organization.project.environment.published` | An environment is published | `publishedProjectEnvironmentID`, `publishedVersionIDBefore`, `publishedVersionIDAfter` |
| `organization.project.environment.merged` | One environment is merged into another | `sourceProjectEnvironmentID`, `targetProjectEnvironmentID`, `sourceProjectEnvironmentRemoved` (source deleted as part of the merge) |
| `organization.project.environment.deleted` | An environment is deleted | `deletedProjectEnvironmentID`, `deletedBy` |

The actor field is `createdBy`, `deletedBy`, `publishedBy` or `mergedBy` depending on the event,
each shaped `{ "type": "user", "userEmail": "..." }`. Environment metadata is
`{ alias, isLive, name, trafficPercentage }`.

The examples handle exactly these events and acknowledge anything else with `200`.

## Retries and Ordering

Voiceflow states no acknowledgement, timeout or retry policy. Return a `2xx` quickly, process
on a queue, and deduplicate on `svix-id`, which is the same for every delivery of a message.

## Full Event Reference

See Voiceflow's [organization events webhooks documentation](https://www.voiceflow.com/docs/api-reference/webhooks/org-events).
