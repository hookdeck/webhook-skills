# Railway Webhooks Overview

## What Are Railway Webhooks?

Railway webhooks notify your own application of deployment status changes and alerts. They are
configured per project (Project Settings > Webhooks) and fire across all environments in the
project. Railway sends an HTTP POST with a JSON body to your URL. Payloads are **not signed**:
you add a custom header with a secret value and check it on your side.

## Common Event Types

| Type | Triggered When | Common Use Cases |
|------|----------------|------------------|
| `Deployment.failed` | A deployment fails (the example in Railway's docs) | Alert the team, open a ticket |
| `Deployment.<state>` | Any other deployment status change | Update a deploy dashboard, notify a channel |
| alert types | A volume usage or CPU/RAM monitor alert fires | Page on-call, scale up |

Railway's docs name only `Deployment.failed` verbatim. Deployment states are listed in its
Deployments reference, and alert type strings are not enumerated, so match on the
`Deployment.` prefix and log anything you don't recognize.

## Event Payload Structure

```json
{
  "type": "Deployment.failed",
  "details": {
    "id": "8107edff-4b8e-44fc-b43a-04566e847a2a",
    "source": "GitHub",
    "status": "SUCCESS",
    "branch": "...",
    "commitHash": "...",
    "commitAuthor": "...",
    "commitMessage": "..."
  },
  "resource": {
    "workspace": { "id": "<workspace id>", "name": "<workspace name>" },
    "project": { "id": "<project id>", "name": "<project name>" },
    "environment": { "id": "<environment id>", "name": "<environment name>", "isEphemeral": false },
    "service": { "id": "<service id>", "name": "<service name>" },
    "deployment": { "id": "<deployment id>" }
  },
  "severity": "WARNING",
  "timestamp": "2025-11-21T23:48:42.311Z"
}
```

- `type` - `<Resource>.<state>`
- `details` - event-specific fields (for deployments: source, branch and commit info)
- `resource` - workspace, project, environment, service and deployment the event is about
- `severity`, `timestamp` - severity label and ISO 8601 time

## Delivery Behavior

- Each attempt has a 30-second timeout; a failed delivery is retried up to 3 times with
  exponential backoff.
- Any 2xx or 3xx response counts as success. Anything else, a timeout or a connection error is a
  failure.
- Delivery is best-effort and events are not ordered. Reconcile against the Railway public API
  when you need certainty.
- If a URL keeps failing (currently 100 failures within 6 hours), Railway stops sending to it for
  24 hours.
- For Discord and Slack webhook URLs, Railway rewrites the payload for that destination
  ("Muxers"). Those are not the format described here.

## Full Event Reference

See [Railway's webhook documentation](https://docs.railway.com/observability/webhooks).
