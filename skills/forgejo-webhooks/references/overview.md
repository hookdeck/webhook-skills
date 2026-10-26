# Forgejo Webhooks Overview

## What Are Forgejo Webhooks?

[Forgejo](https://forgejo.org) (the self-hosted Git forge that runs Codeberg, forked from Gitea) sends an HTTP request to a Payload URL when something happens in a repository. Webhooks can be set per repository, per organization, or instance-wide (system and default webhooks). Besides the raw "Forgejo" type (JSON or form payload, `GET` or `POST`), Forgejo has Gitea, Gogs, Slack, Discord, Matrix, Telegram and other types. This skill covers the **Forgejo** type.

Set a secret on the Forgejo webhook. Without one, deliveries are unsigned and fail verification. Set the webhook's HTTP method to POST and its content type to application/json. Form-encoded and GET deliveries sign the JSON payload rather than the request body and fail verification.

## Common Event Types

The event type is in the `X-Forgejo-Event-Type` header (not the body). `X-Forgejo-Event` carries the coarser group.

| Event type | Triggered When | Common Use Cases |
|------------|----------------|------------------|
| `push` | Commits are pushed | CI/CD, mirroring, deploys |
| `pull_request` | PR opened, closed, reopened, edited | Run checks, notify reviewers |
| `issues` | Issue opened, closed, reopened, edited | Triage, labeling |
| `issue_comment` | Comment on an issue | Bot commands |
| `pull_request_comment` | Comment on a pull request | Bot commands |
| `create` | Branch or tag created | Environment setup |
| `delete` | Branch or tag deleted | Cleanup |
| `release` | Release published, updated, deleted | Deploy, changelog |

Forgejo documents 41 event types in total, including `fork`, `issue_assign`, `issue_label`, `issue_milestone`, `pull_request_assign`, `pull_request_label` and `pull_request_milestone`. Handle the ones you need and log the rest.

## Event Payload Structure

Bodies are JSON. Common fields: `action` (most events), `repository` (`full_name`, `html_url`, `owner`), `sender`, plus event specifics (`ref`, `before`, `after`, `commits`, `pusher` for `push`; `number` and `pull_request` for PRs; `issue` and `comment` for issues).

Headers on every delivery:

| Header | Meaning |
|--------|---------|
| `X-Forgejo-Event-Type` | Exact event type, e.g. `issue_assign` |
| `X-Forgejo-Event` | Event group, e.g. `issues` (empty for package, schedule, workflow_dispatch) |
| `X-Forgejo-Delivery` | Delivery UUID |
| `X-Forgejo-Signature` | Bare hex HMAC-SHA256 (empty if no secret) |

`X-Gitea-*`, `X-Gogs-*` and `X-GitHub-*` headers repeat the same values. Pull request comments go out as `X-Forgejo-Event-Type: pull_request_comment` with `X-Forgejo-Event: issue_comment`.

## Delivery

The webhook settings page has a **Test Delivery** button and a list of **Recent Deliveries**. Timeouts and retries are not documented (they are instance settings).

## Full Event Reference

See [Forgejo's webhook documentation](https://forgejo.org/docs/latest/user/webhooks/).
