# GitLab Webhooks Overview

## What Are GitLab Webhooks?

GitLab webhooks (called "Project Hooks" in GitLab) are HTTP POST requests sent by GitLab to your application when events occur in your GitLab projects. They enable real-time integration with external systems for CI/CD, project management, and automation workflows.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Push Hook` | Code pushed to repository | Trigger builds, update mirrors, notify teams |
| `Tag Push Hook` | New tag created | Trigger releases, create artifacts |
| `Issue Hook` | Issue created/updated/closed | Update project boards, notify assignees |
| `Merge Request Hook` | MR opened/merged/closed | Run tests, update status checks |
| `Pipeline Hook` | Pipeline status changes | Monitor CI/CD, update deployment status |
| `Job Hook` | Job completes | Track build status, collect artifacts |
| `Wiki Page Hook` | Wiki page created/updated | Update documentation sites |
| `Deployment Hook` | Deployment to environment | Update monitoring, notify teams |
| `Release Hook` | Release created | Publish packages, notify users |

## Event Payload Structure

All GitLab webhook payloads include:

```json
{
  "object_kind": "push",           // Event type identifier
  "event_name": "push",            // Human-readable event name
  "before": "95790bf8...",         // Previous commit SHA
  "after": "da1560886...",         // Current commit SHA
  "ref": "refs/heads/main",        // Git reference
  "user_id": 4,                    // User who triggered event
  "user_name": "John Smith",
  "user_username": "jsmith",
  "user_email": "john@example.com",
  "user_avatar": "http://...",
  "project_id": 15,
  "project": {
    "id": 15,
    "name": "My Project",
    "description": "Project description",
    "web_url": "https://gitlab.com/namespace/project",
    "avatar_url": null,
    "git_ssh_url": "git@gitlab.com:namespace/project.git",
    "git_http_url": "https://gitlab.com/namespace/project.git",
    "namespace": "namespace",
    "path_with_namespace": "namespace/project",
    "default_branch": "main"
  }
}
```

## Webhook Headers

GitLab includes these headers with every webhook request:

- `X-Gitlab-Token` - Secret token for verification (if configured)
- `X-Gitlab-Event` - Human-readable event type (e.g., "Push Hook")
- `X-Gitlab-Instance` - Hostname of the GitLab instance
- `X-Gitlab-Webhook-UUID` - Unique ID for the webhook configuration
- `X-Gitlab-Event-UUID` - Unique ID for this specific event delivery
- `Idempotency-Key` - Unique key for retried webhook deliveries

## Webhook Limits

GitLab enforces these limits:

- **Request timeout**: 10 seconds
- **Auto-disabling**: Webhooks are disabled after multiple failures
- **Payload size**: Max 25MB
- **Concurrent webhooks**: Limited per project

## Full Event Reference

For the complete list of events and payload schemas, see [GitLab's webhook documentation](https://docs.gitlab.com/user/project/integrations/webhook_events/).