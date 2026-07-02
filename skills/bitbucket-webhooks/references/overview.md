# Bitbucket Webhooks Overview

## What Are Bitbucket Webhooks?

Bitbucket Cloud uses webhooks to notify your application when events occur in a
repository or workspace. Instead of polling the Bitbucket API for changes,
Bitbucket sends an HTTP POST request to your configured endpoint URL whenever
something happens—like a push, a pull request being created or merged, or a new
issue.

Webhooks are essential for building CI/CD pipelines, ChatOps bots, deployment
automation, and integrations around Bitbucket repositories.

## Common Event Types

The event type is delivered in the `X-Event-Key` request header. Event keys use
the form `resource:action`.

| Event Key | Triggered When | Common Use Cases |
|-----------|----------------|------------------|
| `repo:push` | Commits pushed to a branch or tag | CI/CD triggers, code analysis |
| `repo:fork` | Repository forked | Analytics, notifications |
| `repo:updated` | Repository settings/details changed | Audit, sync |
| `repo:commit_comment_created` | Comment added to a commit | Review workflows |
| `repo:commit_status_created` | Build/commit status created | CI status tracking |
| `repo:commit_status_updated` | Build/commit status updated | CI status tracking |
| `pullrequest:created` | Pull request opened | Code review automation |
| `pullrequest:updated` | PR title/description/commits changed | Re-run checks |
| `pullrequest:approved` | PR approved by a reviewer | Merge gating |
| `pullrequest:unapproved` | PR approval removed | Merge gating |
| `pullrequest:fulfilled` | PR merged | Deploy automation |
| `pullrequest:rejected` | PR declined | Cleanup, notifications |
| `pullrequest:comment_created` | Comment added to a PR | Bot responses, review workflows |
| `issue:created` | Issue created | Triage automation |
| `issue:updated` | Issue updated | Triage automation |
| `issue:comment_created` | Comment added to an issue | Notifications |

## Event Payload Structure

Every Bitbucket webhook payload includes an `actor` (the user who triggered the
event) and a `repository` object, plus event-specific fields.

```json
{
  "actor": {
    "type": "user",
    "display_name": "Emma",
    "nickname": "emmap1",
    "uuid": "{c0a4b7db-...}"
  },
  "repository": {
    "type": "repository",
    "name": "my-repo",
    "full_name": "workspace/my-repo",
    "uuid": "{2e4c5f...}",
    "is_private": true
  }
}
```

**`repo:push`** adds a `push.changes` array. Each change describes the `old` and
`new` state of a branch/tag and the `commits` included:

```json
{
  "push": {
    "changes": [
      {
        "new": { "type": "branch", "name": "main" },
        "old": { "type": "branch", "name": "main" },
        "commits": [{ "hash": "709d658...", "message": "Update README" }]
      }
    ]
  }
}
```

**Pull request events** (`pullrequest:*`) add a `pullrequest` object:

```json
{
  "pullrequest": {
    "id": 1,
    "title": "Add feature",
    "state": "OPEN",
    "source": { "branch": { "name": "feature" } },
    "destination": { "branch": { "name": "main" } }
  }
}
```

## Important Headers

| Header | Description |
|--------|-------------|
| `X-Event-Key` | The event type (e.g. `repo:push`, `pullrequest:created`) |
| `X-Request-UUID` | Unique delivery ID |
| `X-Hub-Signature` | HMAC SHA-256 signature as `sha256=<hex>` (only present when the webhook has a secret) |
| `X-Attempt-Number` | Retry attempt number for the delivery |

## Full Event Reference

For the complete list of events and payloads, see:
- [Manage webhooks](https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/)
- [Event payloads](https://support.atlassian.com/bitbucket-cloud/docs/event-payloads/)
