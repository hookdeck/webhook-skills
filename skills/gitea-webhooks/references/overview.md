# Gitea Webhooks Overview

## What Are Gitea Webhooks?

Gitea sends outbound HTTP requests when repository activity happens. Webhooks can be configured per repository, organization, user, or for the whole instance (system webhooks). Admin-defined default webhooks are copied into new repositories. Deliveries are asynchronous. The `Gitea` and `Gogs` webhook types send the generic payload described here; Slack, Discord and other types send service-specific bodies.

## Common Event Types

The event name is sent in the `X-Gitea-Event` header.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `push` | Commits are pushed to a branch or tag | CI/CD, deploys, mirroring |
| `pull_request` | A PR is opened, closed, reopened, edited, or deleted | Checks, review notifications |
| `issues` | An issue is opened, closed, reopened, edited, or deleted | Triage, tracker sync |
| `issue_comment` | A comment is added to an issue | Bot commands, notifications |
| `create` | A branch or tag is created | Environment setup |
| `delete` | A branch or tag is deleted | Cleanup |
| `release` | A release is published, updated, or deleted | Deploy, changelog |

Other events: `fork`, `wiki`, `repository`, `package`, `status`, `workflow_run`, `workflow_job`, plus grouped issue and PR events such as `issue_assign`, `issue_label`, `pull_request_review_approved`. Grouped events are delivered under a normalized `X-Gitea-Event` (for example `issues`); the exact trigger is in `X-Gitea-Event-Type`.

## Delivery Headers

| Header | Description |
|--------|-------------|
| `X-Gitea-Delivery` | Unique delivery UUID |
| `X-Gitea-Event` | Normalized event name |
| `X-Gitea-Event-Type` | Specific trigger |
| `X-Gitea-Signature` | Hex HMAC-SHA256 of the raw body |
| `X-Hub-Signature-256` | `sha256=<hex>`, GitHub-compatible |
| `X-Hub-Signature` | `sha1=<hex>`, legacy |
| `X-Gogs-*`, `X-GitHub-*` | Compatibility copies |

## Event Payload Structure

JSON payloads share these top-level fields (varies per event):

- `action` - what happened (`opened`, `closed`, `published`, ...) for events that have one
- `repository` - the repository object
- `sender` - the user who triggered the event
- event-specific object: `issue`, `pull_request`, `release`, `comment`, or for `push`: `ref`, `before`, `after`, `commits`, `head_commit`, `pusher`; for `create`/`delete`: `ref`, `ref_type`

Payloads can be `application/json` or form-encoded (JSON inside a `payload` field), depending on the webhook's **POST Content Type**.

## Full Event Reference

See [Gitea's webhook documentation](https://docs.gitea.com/usage/webhooks).
