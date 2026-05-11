# Hugging Face Webhooks Overview

## What Are Hugging Face Webhooks?

Hugging Face webhooks are HTTP POST requests sent by the Hub when events occur on repositories (models, datasets, Spaces) or in their associated discussions and Pull Requests. They are a foundation for MLOps automation: auto-convert models, build community / discussion bots, trigger CI for datasets, kick off training jobs when data changes, and more.

A single webhook can watch:

- Specific repos
- All repos owned by a user or organization (including repos you don't own)

You can also trigger [Hugging Face Jobs](https://huggingface.co/docs/hub/jobs-webhooks) from a webhook to run compute in response to events.

## Common Event Types

Hugging Face identifies events by a pair: `event.scope` and `event.action`.

| `event.scope` | `event.action` | Triggered When | Common Use Cases |
|---------------|----------------|----------------|------------------|
| `repo` | `create` | A repo is created | Index new models, welcome bots |
| `repo` | `update` | A repo's metadata is updated | Sync external catalogs |
| `repo` | `delete` | A repo is deleted | Clean up downstream resources |
| `repo` | `move` | A repo is renamed / transferred | Update references |
| `repo.content` | `update` | New commits, tags, or branches (incl. new PR refs). `updatedRefs` is included | Trigger CI/CD, mirror commits, retrain models |
| `repo.config` | `update` | Settings, secrets, DOI, privacy changes. `updatedConfig` is included | Track config drift, audit changes |
| `discussion` | `create` | A discussion or Pull Request is opened | Discussion bots, PR triage |
| `discussion` | `update` | A discussion title or status is updated, or a PR is merged | Auto-label, notify |
| `discussion` | `delete` | A discussion is deleted | Cleanup |
| `discussion.comment` | `create` | A comment is posted (incl. on discussion creation) | LLM reply bots, mod tooling |
| `discussion.comment` | `update` | A comment is edited or hidden (when hidden, `content` is undefined) | Audit |

> A discussion is a Pull Request when `discussion.isPullRequest` is `true`. On the Hub, PRs are a special type of discussion.

**Forward-compatibility:** More scopes may be added in the future (e.g. `repo.config.dois`). Treat unknown narrowed scopes as an `update` on the broader scope.

## Event Payload Structure

Every payload has at minimum a top-level `event`, `repo`, and `webhook` object:

```json
{
  "event": { "action": "update", "scope": "repo.content" },
  "repo": {
    "type": "model",
    "name": "some-user/some-repo",
    "id": "6366c000a2abcdf2fd69a080",
    "private": false,
    "url": {
      "web": "https://huggingface.co/some-user/some-repo",
      "api": "https://huggingface.co/api/models/some-user/some-repo"
    },
    "headSha": "c379e821c9c95d613899e8c4343e4bfee2b0c600",
    "owner": { "id": "61d2000c3c2083e1c08af22d" }
  },
  "webhook": { "id": "6390e855e30d9209411de93b", "version": 3 }
}
```

`repo.type` is one of `model`, `dataset`, or `space`. `repo.headSha` is only sent when `event.scope` starts with `repo` (not on `discussion` / `discussion.comment` events).

### Code change events (`repo.content`)

`updatedRefs` is an array of refs that changed:

```json
"updatedRefs": [
  { "ref": "refs/heads/main", "oldSha": "ce9a46...", "newSha": "575db8..." },
  { "ref": "refs/tags/test",  "oldSha": null,       "newSha": "575db8..." }
]
```

- New refs have `oldSha: null`.
- Deleted refs have `newSha: null`.
- New PRs trigger this scope due to the newly created ref/commit.

### Config change events (`repo.config`)

```json
"updatedConfig": { "private": false }
```

Currently only `private` is reported. Unsupported config keys produce `"updatedConfig": {}`.

### Discussion events (`discussion`, `discussion.comment`)

```json
"discussion": {
  "id": "639885d811ae2bad2b7ba461",
  "title": "Hello!",
  "url": { "web": "...", "api": "..." },
  "status": "open",
  "author": { "id": "61d2000c3c2083e1c08af22d" },
  "isPullRequest": true,
  "changes": { "base": "refs/heads/main" },
  "num": 3
},
"comment": {
  "id": "6398872887bfcfb93a306f18",
  "author": { "id": "61d2000c3c2083e1c08af22d" },
  "content": "This adds an env key",
  "hidden": false,
  "url": { "web": "..." }
}
```

When a comment is hidden, `comment.content` is undefined.

## Webhook Headers

| Header | Description |
|--------|-------------|
| `X-Webhook-Secret` | The secret you configured, sent verbatim (ASCII only). Can alternatively be passed as a `?secret=` query parameter. |

There is **no** signature header — Hugging Face uses a shared secret, not HMAC.

## Rate Limit

Each webhook is capped at **1,000 triggers per 24 hours**. PRO, Team, and Enterprise plans can request a higher limit via website@huggingface.co.

## Full Event Reference

For the complete documentation, see [Hugging Face Webhooks](https://huggingface.co/docs/hub/webhooks).
