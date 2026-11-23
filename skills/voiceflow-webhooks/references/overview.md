# Voiceflow Webhooks Overview

## What Are Voiceflow Webhooks?

[Voiceflow](https://www.voiceflow.com) is an AI-agent building platform. Its webhooks send an
HTTPS `POST` when something happens, in two scopes: organization events (projects and
environments changing) and each project's session lifecycle webhook (sessions and voice calls
starting and ending). Svix delivers and signs both, so events come from
[Svix's IP addresses](https://docs.svix.com/receiving/source-ips) rather than Voiceflow's.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Scopes | One URL and secret for organization events, and one per project for session events; each lets you listen for all events or pick specific ones |
| Acknowledgement and retries | Voiceflow states no acknowledgement, timeout or retry policy |

Both scopes use the same signing scheme with separate secrets (see [setup.md](setup.md)).

## Event Payload Structure

Every payload has the same envelope:

| Field | Meaning |
|-------|---------|
| `type` | The event name, e.g. `organization.project.created` |
| `data` | Event details. Organization events: `organizationID`, `projectID`, `projectMetadata.name`, `workspaceID`, plus event-specific fields. Session and call events: `userID`, `projectID`, `environmentID`, `startTime` and more |
| `resource` | `organization-<organizationID>` or `project-<projectID>` |
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

Voiceflow says more event types may be added, so acknowledge unknown types with `200`.

### Organization events

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

### Session lifecycle events

| Event | Triggered When | Key `data` fields |
|-------|----------------|-------------------|
| `runtime.session.start` | A session starts for a user | `sessionID`, `userID`, `projectID`, `startTime` |
| `runtime.session.end` | A session ends: the conversation ends, the caller hangs up, or it idles out | `sessionID`, `endTime`, `endReason` |
| `runtime.call.start` | A voice call starts | `platform`, `metadata` (varies by platform), `sessionID` |
| `runtime.call.end` | A voice call's connection is torn down | `endTime`, `endReason`, `platform`, `metadata` |

`versionID`, `transcriptID`, `versionVariant`, `projectEnvironmentID`, `projectEnvironmentAlias`,
`sessionID` (call events) and `endReason` (session end) can be `null` or absent. A voice
conversation sends call events and session events; join them on `data.sessionID` where it's set.
Closing the chat widget doesn't end a session, so `runtime.session.end` can arrive at the idle
timeout. `runtime.session.start.v2`, `runtime.call.start.v2` and `runtime.call.end.v2` are
deprecated in favour of the names without `.v2`.

The examples handle these events and acknowledge anything else with `200`.

## Retries and Ordering

Voiceflow states no acknowledgement, timeout or retry policy. Return a `2xx` quickly, process
on a queue, and deduplicate on `svix-id`, which is the same for every delivery of a message.

## Full Event Reference

See Voiceflow's [organization events webhooks](https://www.voiceflow.com/docs/api-reference/webhooks/org-events)
and [session lifecycle webhook](https://www.voiceflow.com/docs/api-reference/webhooks/session-lifecycle)
documentation.
