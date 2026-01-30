# GitHub Webhooks Overview

## What Are GitHub Webhooks?

GitHub uses webhooks to notify your application when events occur in repositories, organizations, or GitHub Apps. Instead of polling the API for changes, GitHub sends HTTP POST requests to your configured endpoint URL whenever something happens—like a push, pull request, issue, or release.

Webhooks are essential for building CI/CD pipelines, bots, integrations, and automation around GitHub repositories.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `push` | Commits pushed to a branch | CI/CD triggers, code analysis |
| `pull_request` | PR opened, closed, merged, etc. | Code review automation, status checks |
| `issues` | Issue opened, closed, labeled, etc. | Triage automation, notifications |
| `issue_comment` | Comment on issue or PR | Bot responses, review workflows |
| `release` | Release published, edited, deleted | Deploy automation, notifications |
| `create` | Branch or tag created | Environment provisioning |
| `delete` | Branch or tag deleted | Cleanup automation |
| `workflow_run` | GitHub Actions workflow completes | Post-CI automation |
| `check_run` | Status check runs | CI/CD integration |
| `deployment` | Deployment created | Deploy tracking |
| `star` | Repository starred/unstarred | Analytics, engagement tracking |

## Event Payload Structure

All GitHub webhook payloads include:

```json
{
  "action": "opened",
  "sender": {
    "login": "username",
    "id": 123456,
    "type": "User"
  },
  "repository": {
    "id": 789012,
    "name": "repo-name",
    "full_name": "owner/repo-name",
    "private": false
  },
  "organization": {
    "login": "org-name"
  },
  // ... event-specific fields
}
```

Key headers included with each webhook:

| Header | Description |
|--------|-------------|
| `X-GitHub-Event` | The event type (e.g., `push`, `pull_request`) |
| `X-GitHub-Delivery` | Unique delivery ID (GUID) |
| `X-Hub-Signature-256` | HMAC SHA-256 signature |
| `X-Hub-Signature` | HMAC SHA-1 signature (deprecated) |

## The `action` Field

Most events include an `action` field that specifies what happened:

**pull_request actions:**
- `opened`, `closed`, `reopened`, `edited`
- `assigned`, `unassigned`, `labeled`, `unlabeled`
- `synchronize` (new commits pushed)
- `merged`

**issues actions:**
- `opened`, `closed`, `reopened`, `edited`
- `assigned`, `unassigned`, `labeled`, `unlabeled`
- `transferred`, `deleted`

## Full Event Reference

For the complete list of events and payloads, see:
- [GitHub Webhooks Overview](https://docs.github.com/en/webhooks)
- [Webhook Events and Payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
